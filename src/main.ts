import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
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

    const octokit: InstanceType<typeof GitHub> = github.getOctokit(githubToken)

    const payload: WebhookPayload = github.context.payload
    if (!payload || !payload.ref) {
      throw new Error('Invalid payload. Could not find the branch information.')
    }

    const branchName = payload.ref.replace('refs/heads/', '')

    core.info(`Base branch: ${branchName}`)
    core.info(`Target branch: ${targetBranch}`)
    core.info(`Attempting to merge ${branchName} into ${targetBranch}`)

    await mergeBranch(
      octokit,
      targetBranch,
      branchName,
      commitMessage,
      createPullRequest
    )

    core.info(`Merged branch ${branchName} into ${targetBranch}`)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

async function mergeBranch(
  octokit: InstanceType<typeof GitHub>,
  baseBranch: string,
  branchName: string,
  commitMessage: string,
  createPullRequest: boolean
): Promise<void> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo

  try {
    // Attempt to perform the merge operation
    await octokit.rest.repos.merge({
      owner,
      repo,
      base: baseBranch,
      head: branchName,
      commit_message: commitMessage
    })
  } catch (error: any) {
    // If a 409 conflict error occurs, create a pull request instead
    if (error.status === 409 && createPullRequest) {
      const pullRequest = await octokit.rest.pulls.create({
        owner,
        repo,
        title: `Merge ${branchName} into ${baseBranch}`,
        head: branchName,
        base: baseBranch,
        body: 'Automatic merge conflict, please resolve manually.'
      })
      core.info(`Pull request created: ${pullRequest.data.html_url}`)
    } else {
      throw error
    }
  }
}

run()
