import type { RobotsMatcher } from './types';
import { getOrigin } from './url-utils';

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

function toRuleRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const suffix = pattern.endsWith('$') ? '' : '.*';
  return new RegExp(`^${escaped}${suffix}`);
}

function normalizeAgent(userAgent: string): string[] {
  const lowered = userAgent.toLowerCase();
  return [lowered, lowered.split(/[\/\s]/)[0] ?? lowered].filter(Boolean);
}

function parseRobots(text: string): Array<{ agent: string; rules: Rule[] }> {
  const groups: Array<{ agent: string; rules: Rule[] }> = [];
  let currentAgents: string[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;
    const value = rest.join(':').trim();
    const lowered = key.trim().toLowerCase();

    if (lowered === 'user-agent') {
      currentAgents = [value.toLowerCase()];
      groups.push(...currentAgents.map((agent) => ({ agent, rules: [] })));
      continue;
    }

    if ((lowered === 'allow' || lowered === 'disallow') && currentAgents.length > 0) {
      const targetGroups = groups.filter((group) => currentAgents.includes(group.agent));
      const pattern = value || '/';
      for (const group of targetGroups) {
        group.rules.push({
          allow: lowered === 'allow',
          pattern,
          regex: toRuleRegex(pattern),
        });
      }
    }
  }

  return groups;
}

function pickRules(groups: Array<{ agent: string; rules: Rule[] }>, userAgent: string): Rule[] {
  const candidates = normalizeAgent(userAgent);
  for (const candidate of candidates) {
    const exact = groups.find((group) => group.agent === candidate);
    if (exact) return exact.rules;
  }
  return groups.find((group) => group.agent === '*')?.rules ?? [];
}

export async function loadRobotsMatcher(baseUrl: string, userAgent: string): Promise<RobotsMatcher> {
  const origin = getOrigin(baseUrl);
  const sourceUrl = `${origin}/robots.txt`;

  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': userAgent },
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        sourceUrl,
        allows: () => true,
      };
    }

    const rules = pickRules(parseRobots(await response.text()), userAgent);

    return {
      sourceUrl,
      allows: (url: string) => {
        try {
          const pathname = new URL(url).pathname || '/';
          let winner: Rule | null = null;
          for (const rule of rules) {
            if (!rule.regex.test(pathname)) continue;
            if (!winner || rule.pattern.length >= winner.pattern.length) {
              winner = rule;
            }
          }
          return winner ? winner.allow : true;
        } catch {
          return true;
        }
      },
    };
  } catch {
    return {
      sourceUrl,
      allows: () => true,
    };
  }
}
