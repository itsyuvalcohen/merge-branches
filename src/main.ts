import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import * as lodash from 'lodash'
import {WebhookPayload} from '@actions/github/lib/interfaces'

async function run(): Promise<void> {
  try {
    const targetBranch: string = core.getInput('target_branch')
    const targetBranchPattern = core.getInput('target_branch_pattern')
    const commitMessage: string = core.getInput('message', {required: true})
    const githubToken: string = core.getInput('github_token', {required: true})
    const createPullRequest: boolean = core.getBooleanInput(
      'create_pull_request',
      {
        required: true
      }
    )
    const addPRReviewer: boolean = core.getBooleanInput('add_pr_reviewer', {
      required: true
    })

    core.info(`targetBranch: ${targetBranch}`)
    core.info(`targetBranchPattern: ${targetBranchPattern}`)

    let target = null
    if (!targetBranch && !targetBranchPattern) {
      throw new Error('No target branch')
    } else {
      target =
        targetBranch && !targetBranchPattern
          ? targetBranch
          : new RegExp(targetBranchPattern)
    }

    const octokit: InstanceType<typeof GitHub> = github.getOctokit(githubToken)

    const owner: string = github.context.repo.owner
    const repo: string = github.context.repo.repo

    const payload: WebhookPayload = github.context.payload
    if (!payload || !payload.ref) {
      throw new Error('Invalid payload. Could not find the branch information.')
    }

    const branchName = payload.ref.replace('refs/heads/', '')

    core.info(`Base branch: ${branchName}`)
    if (lodash.isRegExp(target)) {
      core.info(`Target branch regex pattern: ${target}`)
      const branches = await getBranches(octokit, owner, repo, target)
      if (lodash.isEmpty(branches)) {
        core.info('No matching branches')
      } else {
        for (const branch of branches) {
          await mergeBranch(
            octokit,
            owner,
            repo,
            branch,
            branchName,
            commitMessage,
            createPullRequest,
            addPRReviewer
          )
        }
      }
    } else {
      core.info(`Target branch: ${target}`)
      await mergeBranch(
        octokit,
        owner,
        repo,
        target,
        branchName,
        commitMessage,
        createPullRequest,
        addPRReviewer
      )
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

async function mergeBranch(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  targetBranch: string,
  branchName: string,
  commitMessage: string,
  createPullRequest: boolean,
  addPRReviewer: boolean
): Promise<void> {
  try {
    core.info(`Attempting to merge ${branchName} into ${targetBranch}`)
    // Attempt to perform the merge operation
    await octokit.rest.repos.merge({
      owner,
      repo,
      base: targetBranch,
      head: branchName,
      commit_message: commitMessage
    })
    core.info(`Merged branch ${branchName} into ${targetBranch}`)
  } catch (error: any) {
    // If a 409 conflict error occurs, create a pull request instead
    if (error.status === 409 && createPullRequest) {
      core.info('Automatic merge conflict, creating a pull request.')
      try {
        const pullRequest = await octokit.rest.pulls.create({
          owner,
          repo,
          title: `Merge ${branchName} into ${targetBranch}`,
          head: branchName,
          base: targetBranch,
          body: 'Automatic merge conflict, please resolve manually.'
        })
        core.info(`Pull request created: ${pullRequest.data.html_url}`)
        if (addPRReviewer) {
          await octokit.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number: pullRequest.data.number,
            reviewers: [github.context.actor]
          })
        }
      } catch (err: any) {
        if (err.message.includes('already exists')) {
          core.info('A pull request already exists')
        } else {
          throw err
        }
      }
    } else {
      throw error
    }
  }
}

async function getBranches(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  targetPattern: RegExp
): Promise<string[]> {
  const pageSize = 100
  let branches: string[] = []

  let hasNextPage = true
  let cursor = null

  while (hasNextPage) {
    const resultBranches: any = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: pageSize,
      page: cursor ? cursor + 1 : 1
    })

    const pageBranches = resultBranches.data.map((branch: any) => branch.name)
    branches = branches.concat(pageBranches)

    hasNextPage = resultBranches.headers.link
      ? resultBranches.headers.link.includes('rel="next"')
      : false
    if (hasNextPage) {
      const lastPageURL = resultBranches.headers.link.match(
        /<([^>]+)>;\s*rel="last"/
      )
      if (lastPageURL) {
        const lastPageNumber = lastPageURL[1].match(/page=(\d+)/)
        cursor = lastPageNumber ? parseInt(lastPageNumber[1]) : null
      }
    }
  }

  return branches.filter(branch => targetPattern.test(branch))
}

run()
