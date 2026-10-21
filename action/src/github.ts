import type { getOctokit } from "@actions/github";
import type { DriftReport } from "./types.js";
import { REPORT_MARKER } from "./report.js";

type GitHub = ReturnType<typeof getOctokit>;

export const ISSUE_LABEL = "modeldrift";
export const ISSUE_TITLE = "ModelDrift: hard-coded LLM prices are stale";

export interface CommentRecord {
  id: number;
  body?: string | null;
}

export function commentAction(comments: CommentRecord[]): { type: "update"; id: number } | { type: "create" } {
  const existing = comments.find((comment) => comment.body?.includes(REPORT_MARKER));
  return existing ? { type: "update", id: existing.id } : { type: "create" };
}

export async function upsertPullRequestComment(
  octokit: GitHub,
  repo: { owner: string; repo: string },
  pullNumber: number,
  body: string,
): Promise<"created" | "updated"> {
  const comments: CommentRecord[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const response = await octokit.rest.issues.listComments({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: pullNumber,
      per_page: 100,
      page,
    });
    comments.push(...response.data);
    if (response.data.length < 100) break;
  }
  const action = commentAction(comments);
  if (action.type === "update") {
    await octokit.rest.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: action.id,
      body,
    });
    return "updated";
  }
  await octokit.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: pullNumber,
    body,
  });
  return "created";
}

export async function syncDriftIssue(
  octokit: GitHub,
  repo: { owner: string; repo: string },
  report: DriftReport,
): Promise<"opened" | "updated" | "closed" | "none"> {
  await ensureLabel(octokit, repo);
  const listed = await octokit.rest.issues.listForRepo({
    owner: repo.owner,
    repo: repo.repo,
    state: "open",
    labels: ISSUE_LABEL,
    per_page: 20,
  });
  const existing = listed.data.find((issue) => issue.title === ISSUE_TITLE);
  if (!report.hasDrift) {
    if (!existing) return "none";
    const cleared = `${REPORT_MARKER}\n\n## ModelDrift\n\nNo hard-coded model drift in ${report.scannedFiles} scanned files. Closing this issue.`;
    await octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: existing.number,
      body: cleared,
    });
    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: existing.number,
      state: "closed",
      state_reason: "completed",
    });
    return "closed";
  }
  if (existing) {
    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: existing.number,
      body: report.markdown,
    });
    return "updated";
  }
  await octokit.rest.issues.create({
    owner: repo.owner,
    repo: repo.repo,
    title: ISSUE_TITLE,
    body: report.markdown,
    labels: [ISSUE_LABEL],
  });
  return "opened";
}

async function ensureLabel(octokit: GitHub, repo: { owner: string; repo: string }): Promise<void> {
  try {
    await octokit.rest.issues.createLabel({
      owner: repo.owner,
      repo: repo.repo,
      name: ISSUE_LABEL,
      color: "d93f0b",
      description: "Hard-coded LLM model or price drift",
    });
  } catch {
    // The label already exists, or this token cannot manage labels.
  }
}
