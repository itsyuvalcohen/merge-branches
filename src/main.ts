import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import * as lodash from 'lodash'
import {WebhookPayload} from '@actions/github/lib/interfaces'

async function run(): Promise<void> {
  try {
    const targetBranch: string = core.getInput('target_branch', {
      required: true
    })
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

    const octokit: InstanceType<typeof GitHub> = github.getOctokit(githubToken)

    const owner: string = github.context.repo.owner
    const repo: string = github.context.repo.repo

    const payload: WebhookPayload = github.context.payload
    if (!payload || !payload.ref || lodash.isUndefined(payload.ref)) {
      throw new Error('Invalid payload. Could not find the branch information.')
    }

    const branchName = payload.ref.replace('refs/heads/', '')

    core.info(`Base branch: ${branchName}`)
    if (lodash.isRegExp(targetBranch)) {
      core.info(`Target branch regex pattern: ${targetBranch}`)
      const branches = await getBranches(octokit, owner, repo, targetBranch)
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
    } else {
      core.info(`Target branch: ${targetBranch}`)
      await mergeBranch(
        octokit,
        owner,
        repo,
        targetBranch,
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
          octokit.rest.pulls.requestReviewers({
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
  targetBranch: string
): Promise<string[]> {
  const pageSize = 100
  let branches: string[] = []

  let hasNextPage = true
  let cursor = null

  while (hasNextPage) {
    const queryBranches = `{
      repository(owner: "${owner}", name: "${repo}") {
        refs(refPrefix: "refs/heads/", first: ${pageSize}, after: ${cursor}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              name
            }
          }
        }
      }
    }`

    const resultBranches: any = await octokit.graphql(queryBranches)
    const pageInfo = resultBranches.repository.refs.pageInfo
    const pageBranches = resultBranches.repository.refs.edges.map(
      (edge: any) => edge.node.name
    )
    branches = branches.concat(pageBranches)

    hasNextPage = pageInfo.hasNextPage
    cursor = `"${pageInfo.endCursor}"`
  }

  return branches.filter(branch => new RegExp(targetBranch).test(branch))
}

run()
