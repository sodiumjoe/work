const { execFileSync } = require('node:child_process');

const GH_HOST = 'git.corp.stripe.com';
const TIMEOUT_MS = 10_000;

function fetchReviews() {
  if (process.env.WORK_SKIP_REVIEWS) return { reviews: [], error: null };
  try {
    const raw = execFileSync('gh', [
      'api', '/search/issues?q=is:pr+is:open+assignee:@me',
      '--jq', '.items[] | {title: .title, url: .html_url, author: .user.login, number: .number, repository_url: .repository_url, updated_at: .updated_at}',
    ], {
      env: { ...process.env, GH_HOST },
      timeout: TIMEOUT_MS,
      encoding: 'utf-8',
    });
    const reviews = raw.trim().split('\n').filter(Boolean).map(line => {
      const obj = JSON.parse(line);
      const repo = obj.repository_url.replace(/.*\/repos\//, '');
      return {
        title: obj.title,
        url: obj.url,
        author: obj.author,
        repo,
        number: obj.number,
        updatedAt: obj.updated_at,
      };
    });
    return { reviews, error: null };
  } catch (e) {
    return { reviews: [], error: e.message };
  }
}

function formatReviews(reviews) {
  if (reviews.length === 0) return [];
  const lines = ['<!-- auto-generated from GH, do not edit -->'];
  for (const r of reviews) {
    lines.push(`- [${r.repo}#${r.number}](${r.url}) — ${r.title} (${r.author})`);
  }
  return lines;
}

module.exports = { fetchReviews, formatReviews };