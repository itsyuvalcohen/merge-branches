import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {WebhookPayload} from '@actions/github/lib/interfaces'

async function run(): Promise<void> {
  try {
    const targetBranch: string = core.getInput('target_branch', {required: true})
    const commitMessage: string = core.getInput('message', {required: true})
    const githubToken: string = core.getInput('github_token', {required: true})

    const octokit: InstanceType<typeof GitHub> = github.getOctokit(githubToken)

    const payload: WebhookPayload = github.context.payload
    if (!payload || !payload.ref) {
      throw new Error('Invalid payload. Could not find the branch information.')
    }

    const branchName = payload.ref.replace('refs/heads/', '')

    await mergeBranch(octokit, targetBranch, branchName, commitMessage)

    core.setOutput(
      'message',
      `Merged branch ${branchName} into ${targetBranch}`
    )
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

async function mergeBranch(
  octokit: InstanceType<typeof GitHub>,
  baseBranch: string,
  branchName: string,
  commitMessage: string
): Promise<void> {
  await octokit.rest.git.createRef({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    ref: `refs/heads/${baseBranch}`,
    sha: github.context.sha
  })

  await octokit.rest.repos.merge({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    base: baseBranch,
    head: branchName,
    commit_message: commitMessage
  })
}

run()
