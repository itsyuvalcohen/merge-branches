import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {WebhookPayload} from '@actions/github/lib/interfaces'
import {RequestError} from '@octokit/types'

async function run(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    const targetBranch: string = core.getInput('target_branch', {
      required: true
    })
    const commitMessage: string = core.getInput('message', {required: true})
    const githubToken: string = core.getInput('github_token', {required: true})

    const octokit: InstanceType<typeof GitHub> = github.getOctokit(githubToken)

    const payload: WebhookPayload = github.context.payload
    if (!payload || !payload.ref) {
      throw new Error('Invalid payload. Could not find the branch information.')
    }

    const branchName = payload.ref.replace('refs/heads/', '')

    await mergeBranch(octokit, targetBranch, branchName, commitMessage)

    core.info(`Merged branch ${branchName} into ${targetBranch}`)
  } catch (error: RequestError) {
    core.setFailed(error.message)
  }
}

async function mergeBranch(
  octokit: InstanceType<typeof GitHub>,
  baseBranch: string,
  branchName: string,
  commitMessage: string
): Promise<void> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo

  core.info(`${owner}, ${repo}`)

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    // Attempt to perform the merge operation
    await octokit.rest.repos.merge({
      owner,
      repo,
      base: baseBranch,
      head: branchName,
      commit_message: commitMessage
    })
  } catch (error: RequestError) {
    // If a 409 conflict error occurs, create a pull request instead
    if (error.status === 409) {
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
