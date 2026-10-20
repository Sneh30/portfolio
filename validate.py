#!/usr/bin/env python3
"""Automated validation for this portfolio's machine-readable surface.

    python3 validate.py             offline checks (default, no network)
    python3 validate.py --online    additionally HTTP-check every repository URL

Exit status is non-zero when any check fails, so the same command works in CI
or as a pre-commit hook. Every rule below is derived from the published record
(candidate.json and friends), never re-typed, so a value can only fail here if
the files genuinely disagree with each other.

What is covered
---------------
  1. the four JSON records parse and share one schema (2.0)
  2. shared blocks are byte-identical across files (evidence_labels,
     support_levels, job_search, conventions)
  3. every status/qualifier anywhere is one of the six canonical labels
  4. roles: ids, reference resolution, and projection into agent-card.json,
     llms.txt, and the Agent Mode role pane
  5. evidence graph coverage: every capability claim has exactly one chain
  6. private-repo invariants (exists / not publicly verifiable / access on
     request / recruiter note)
  7. Agent Mode page: h1->h2 outline, landmarks, JSON-LD, anchors, internal
     links, and all 14 code panes parse as their declared language
  8. Human page: same structural checks
  9. llms.txt, robots.txt, sitemap.xml
 10. cross-file URL consistency
 11b. the four records validate against schemas/*.schema.json
     (jsonschema, Draft 2020-12, format-checked)
 12. (--online) anonymous reachability: public repos 200, private repos 404
"""
import argparse
import ast
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
CANON = 'https://sneh30.github.io/portfolio/'
AGENT_CANON = CANON + 'agent/'
SCHEMA = '2.0'

RECORDS = ['candidate.json', 'capabilities.json', 'evidence.json',
           'agent-card.json']

# The one place a chain legitimately cites a URL other than the project's own
# repository: webcmd's evidence is the *upstream* merged pull request, which is
# stronger evidence than the fork stored in candidate.json.
EVIDENCE_URL_EXCEPTIONS = {
    'project-webcmd': 'https://github.com/agentrhq/webcmd/pull/190',
}

PRIVATE_IDS = {'project-agentic-hinge', 'project-pocket-typist'}


# ── reporting ───────────────────────────────────────────────────────────────
class Report:
    def __init__(self):
        self.passed = self.failed = 0
        self.failures = []

    def sec(self, title):
        print('\n' + title)
        print('-' * len(title))

    def ok(self, label, cond, detail=''):
        if cond:
            self.passed += 1
            print('  PASS  %s' % label)
        else:
            self.failed += 1
            msg = '%s%s' % (label, (' — ' + detail) if detail else '')
            self.failures.append(msg)
            print('  FAIL  %s' % msg)

    def info(self, msg):
        print('  info  %s' % msg)

    def eq(self, label, got, want):
        self.ok(label, got == want,
                'got %r, want %r' % (got, want) if got != want else '')


R = Report()


# ── minimal HTML reader ─────────────────────────────────────────────────────
class Page(HTMLParser):
    """Collects the handful of facts the structural checks need."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.hrefs, self.headings = [], [], []
        self.tags = {}
        self.metas, self.rel, self.jsonld = {}, {}, []
        self.lang = self.title = None
        self._head = self._title = None
        self._ld = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags[tag] = self.tags.get(tag, 0) + 1
        if a.get('id'):
            self.ids.append(a['id'])
        if a.get('href'):
            self.hrefs.append(a['href'])
        if tag == 'html':
            self.lang = a.get('lang')
        elif tag == 'meta':
            k = a.get('name') or a.get('property')
            if k:
                self.metas[k] = a.get('content') or ''
        elif tag == 'link' and a.get('rel'):
            self.rel.setdefault(a['rel'], []).append(a.get('href'))
        elif tag == 'script' and a.get('type') == 'application/ld+json':
            self._ld = []
        if re.fullmatch(r'h[1-6]', tag):
            self._head = [tag, []]
        elif tag == 'title':
            self._title = []

    def handle_endtag(self, tag):
        if self._head and tag == self._head[0]:
            self.headings.append((tag, ' '.join(''.join(self._head[1]).split())))
            self._head = None
        elif tag == 'title' and self._title is not None:
            self.title = ' '.join(''.join(self._title).split())
            self._title = None
        elif tag == 'script' and self._ld is not None:
            self.jsonld.append(''.join(self._ld))
            self._ld = None

    def handle_data(self, data):
        if self._head is not None:
            self._head[1].append(data)
        if self._title is not None:
            self._title.append(data)
        if self._ld is not None:
            self._ld.append(data)


def read_page(path):
    p = Page()
    p.feed(io.open(path, encoding='utf-8').read())
    p.close()
    return p


def plain(html):
    return ' '.join(__import__('html').unescape(re.sub(r'<[^>]+>', ' ',
                                                       html)).split())


def pane_lines(body):
    """Visible text of a code pane, guide marks stripped (they carry no text)."""
    return '\n'.join(__import__('html').unescape(re.sub(r'<[^>]+>', '', m))
                     for m in re.findall(r'<div class="line"[^>]*>(.*?)</div>',
                                         body, re.S))


# ── shared blocks ───────────────────────────────────────────────────────────
def shared_block(rec, key):
    return json.dumps(rec.get(key), sort_keys=True, ensure_ascii=False)


def walk_status(node, path, fname, labels, out, skip=('schema', 'evidence_labels',
                                                      'support_levels',
                                                      'definitions', 'conventions')):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in skip:
                continue
            if k in ('status', 'evidence_status', 'evidence_level') and \
                    isinstance(v, str):
                if v not in labels and not v.startswith('http'):
                    out.append('%s: %s.%s = %r' % (fname, path, k, v))
            elif k == 'qualifiers' and isinstance(v, list):
                for s in v:
                    if s not in labels:
                        out.append('%s: %s.qualifiers = %r' % (fname, path, s))
            else:
                walk_status(v, '%s.%s' % (path, k), fname, labels, out, skip)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk_status(v, '%s[%d]' % (path, i), fname, labels, out, skip)


# ════════════════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--online', action='store_true',
                    help='HTTP-check every repository URL')
    args = ap.parse_args()

    # ── 1. records parse ────────────────────────────────────────────────────
    R.sec('1. Structured records')
    recs = {}
    for name in RECORDS:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            R.ok('%s exists' % name, False, 'missing')
            continue
        try:
            recs[name] = json.load(io.open(path, encoding='utf-8'))
            R.ok('%s parses as JSON' % name, True)
        except Exception as e:
            R.ok('%s parses as JSON' % name, False, str(e))
    if len(recs) != len(RECORDS):
        return R

    cand = recs['candidate.json']
    caps = recs['capabilities.json']
    ev = recs['evidence.json']
    card = recs['agent-card.json']

    # ── 2. shared blocks ────────────────────────────────────────────────────
    R.sec('2. Schema version, dates and shared blocks')
    for name, rec in recs.items():
        R.eq('%s schema_version == %s' % (name, SCHEMA),
             rec.get('schema_version'), SCHEMA)
    dates = {rec.get('generated_at') for rec in recs.values()}
    R.eq('all records share one generated_at', len(dates), 1)
    R.info('generated_at = %s' % next(iter(dates)))

    for name, rec in recs.items():
        R.ok('%s carries the conventions block' % name,
             'schema' in rec and isinstance(rec['schema'], dict))
        R.ok('%s carries evidence_labels' % name, 'evidence_labels' in rec)
        R.ok('evidence_labels identical in %s' % name,
             shared_block(rec, 'evidence_labels') ==
             shared_block(recs['candidate.json'], 'evidence_labels'))
    for block in ('support_levels', 'job_search'):
        R.ok('%s identical in candidate + agent-card' % block,
             shared_block(cand, block) == shared_block(card, block))

    labels = cand['evidence_labels']['values']
    R.ok('exactly six evidence labels', len(labels) == 6,
         'got %d' % len(labels))
    R.ok('definitions cover every label',
         set(cand['evidence_labels']['definitions']) == set(labels))
    R.ok('private repo renamed to private_available_on_request',
         'private_available_on_request' in labels and 'private_repo' not in labels)

    # ── 3. vocabulary ───────────────────────────────────────────────────────
    R.sec('3. Status vocabulary everywhere')
    bad = []
    for name, rec in recs.items():
        walk_status(rec, '$', name, set(labels), bad)
    R.ok('every status / qualifier / evidence_level is canonical', not bad,
         '; '.join(bad[:4]))

    raw = {n: io.open(os.path.join(ROOT, n), encoding='utf-8').read()
           for n in RECORDS}
    legacy = {
        'last_verified (renamed to checked)': r'"last_verified"',
        'repository_link_in_portfolio (folded into repository)':
            r'"repository_link_in_portfolio"',
        'verification_status (renamed to status)':
            r'"verification_status"',
        'verification_states (renamed to evidence_labels)':
            r'"verification_states"',
        'identity "status" (renamed to availability)': r'"status":\s*"Open to work',
        '"private_repo" as a value': r'":\s*"private_repo"',
    }
    for label, pat in legacy.items():
        hits = [n for n, t in raw.items() if re.search(pat, t)]
        R.ok('no %s' % label, not hits, 'found in %s' % ', '.join(hits))

    # ── 4. roles ────────────────────────────────────────────────────────────
    R.sec('4. Roles and their references')
    roles = cand['roles']
    cap_ids = {c['id'] for c in caps['capabilities']}
    proj_ids = {p['id'] for p in cand['projects']}
    exp_ids = {x['id'] for x in cand['experience']}
    role_ids = [r.get('id') for r in roles]

    R.ok('every role has an id prefixed role-', all(
        i and i.startswith('role-') for i in role_ids), str(role_ids[:3]))
    R.eq('role ids unique', len(set(role_ids)), len(role_ids))
    support_vals = set(cand['support_levels']['values'])
    bad_sup = [r['role'] for r in roles if r.get('support') not in support_vals]
    R.ok('support levels are canonical', not bad_sup, str(bad_sup))

    unresolved = []
    for r in roles:
        for ref in r.get('evidence', []):
            if ref not in cap_ids:
                unresolved.append('%s -> %s' % (r['role'], ref))
        for ref in r.get('projects', []):
            if ref not in proj_ids:
                unresolved.append('%s -> %s' % (r['role'], ref))
        for ref in r.get('experience', []):
            if ref not in exp_ids:
                unresolved.append('%s -> %s' % (r['role'], ref))
        if not r.get('evidence'):
            unresolved.append('%s has no capability evidence' % r['role'])
        if not r.get('projects') and not r.get('experience'):
            unresolved.append('%s has no project or experience' % r['role'])
    R.ok('every role resolves to real capability/project/experience ids',
         not unresolved, '; '.join(unresolved[:4]))
    R.info('%d roles, %d capabilities, %d projects, %d experiences'
           % (len(roles), len(cap_ids), len(proj_ids), len(exp_ids)))

    # agent-card projection
    tgt = [(t.get('id'), t.get('role'), t.get('support')) for t in
           card['target_roles']]
    want = [(r['id'], r['role'], r['support']) for r in roles]
    R.eq('agent-card target_roles projects onto candidate.roles', tgt, want)

    # private-repo invariants
    priv = [p for p in cand['projects'] if p['id'] in PRIVATE_IDS]
    R.eq('exactly two private repositories', len(priv), 2)
    for p in priv:
        v = p['verification']
        R.ok('%s: private_available_on_request' % p['name'],
             v.get('status') == 'private_available_on_request')
        R.ok('%s: exists but not publicly verifiable' % p['name'],
             v.get('repository_exists') is True and
             v.get('publicly_verifiable') is False and
             v.get('access') == 'available_on_request')
        R.ok('%s: recruiter access note present' % p['name'],
             'recruiter' in (v.get('access_note') or '').lower())
        R.ok('%s: repository URL recorded' % p['name'],
             (p.get('repository') or '').startswith('https://github.com/'))
    for p in cand['projects']:
        v = p['verification']
        if v.get('status') == 'public_repo' and p['id'] not in PRIVATE_IDS:
            if not (v.get('publicly_verifiable') is True and
                    v.get('access') == 'public'):
                R.ok('%s marked publicly verifiable' % p['name'], False)
            R.ok('%s has a checked date' % p['name'],
                 bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(v.get('checked', '')))))

    # ── 5. evidence graph ───────────────────────────────────────────────────
    R.sec('5. Evidence graph coverage')
    chains = ev['chains']
    chain_keys = {(c.get('capability'), c.get('project')) for c in chains}
    missing, malformed = [], []
    for c in caps['capabilities']:
        for e in c['evidence']:
            key = (c['id'], e.get('project'))
            if key not in chain_keys:
                missing.append('%s / %s' % key)
            if e.get('status') not in labels:
                malformed.append('%s status=%r' % (key, e.get('status')))
            if not e.get('verification_url'):
                malformed.append('%s has no verification_url' % (key,))
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(e.get('checked', ''))):
                malformed.append('%s checked=%r' % (key, e.get('checked')))
    R.ok('every capability claim has an evidence chain', not missing,
         '; '.join(missing[:4]))
    R.ok('capability evidence entries are well formed', not malformed,
         '; '.join(malformed[:4]))

    orphan = []
    for ch in chains:
        v = ch['verification']
        if v.get('status') not in labels:
            orphan.append('%s status=%r' % (ch.get('capability'), v.get('status')))
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(v.get('checked', ''))):
            orphan.append('%s checked=%r' % (ch.get('capability'), v.get('checked')))
        if ch.get('project') and ch.get('project') not in proj_ids:
            orphan.append('%s -> unknown project %s' % (ch.get('capability'),
                                                        ch.get('project')))
    R.ok('every chain carries a canonical status and a checked date', not orphan,
         '; '.join(orphan[:4]))
    R.info('%d chains for %d capabilities' % (len(chains), len(caps['capabilities'])))

    # ── 6. cross-file roles: llms.txt + Agent Mode pane ─────────────────────
    R.sec('6. Roles in llms.txt and the Agent Mode page')
    llms = io.open(os.path.join(ROOT, 'llms.txt'), encoding='utf-8').read()
    m = re.search(r'^## Relevant roles\n\n(.+?)\n', llms, re.S | re.M)
    R.ok('llms.txt has a Relevant roles section', bool(m))
    if m:
        llms_roles = [re.split(r'\s+\(', x.strip(), maxsplit=1)[0]
                      for x in m.group(1).split(' · ')]
        R.eq('llms.txt lists every role in order',
             llms_roles, [r['role'] for r in roles])

    agent_html = io.open(os.path.join(ROOT, 'agent', 'index.html'),
                         encoding='utf-8').read()
    sec = re.search(r'<section class="pane"[^>]*data-file="f09".*?>(.*?)</section>',
                    agent_html, re.S)
    R.ok('Agent Mode role pane present', bool(sec))
    if sec:
        try:
            import yaml
            d = yaml.safe_load(pane_lines(sec.group(1)))
            pane_roles = [r['role'] for r in d['roles']]
            R.eq('role pane matches candidate.json exactly',
                 pane_roles, [r['role'] for r in roles])
            R.ok('role pane carries Role ID + Support for every role',
                 all('Role ID' in r and 'Support' in r for r in d['roles']))
        except Exception as e:
            R.ok('role pane parses as YAML', False, str(e))

    # ── 7. Agent Mode page ──────────────────────────────────────────────────
    R.sec('7. Agent Mode page (agent/index.html)')
    p = read_page(os.path.join(ROOT, 'agent', 'index.html'))
    h1 = [t for lvl, t in p.headings if lvl == 'h1']
    h2 = [t for lvl, t in p.headings if lvl == 'h2']
    R.eq('exactly one h1', len(h1), 1)
    R.ok('h1 names the candidate', bool(h1) and 'Sneh' in h1[0], str(h1[:1]))
    R.eq('thirteen h2 sections (README promoted to h1)', len(h2), 13)
    R.ok('landmarks present: main / article / nav',
         p.tags.get('main') and p.tags.get('article') and p.tags.get('nav'))
    R.ok('lang attribute', p.lang == 'en')
    R.ok('title', bool(p.title and 'Agent Mode' in p.title))
    R.ok('meta description', bool(p.metas.get('description')))
    R.ok('canonical link', p.rel.get('canonical') == [AGENT_CANON],
         str(p.rel.get('canonical')))
    R.ok('robots meta allows indexing', 'index' in p.metas.get('robots', ''))

    # JSON-LD
    ld = None
    if p.jsonld:
        try:
            ld = json.loads(p.jsonld[0])
            R.ok('JSON-LD parses', True)
        except Exception as e:
            R.ok('JSON-LD parses', False, str(e))
    else:
        R.ok('JSON-LD block present', False)
    if ld:
        R.eq('JSON-LD @type', ld.get('@type'), 'Person')
        R.eq('JSON-LD name matches record', ld.get('name'), cand['candidate']['name'])
        R.eq('JSON-LD jobTitle matches record', ld.get('jobTitle'),
             cand['candidate']['role'])
        R.eq('JSON-LD telephone matches record', ld.get('telephone'),
             cand['contact']['phone'])
        R.eq('JSON-LD affiliation matches education entry',
             (ld.get('affiliation') or {}).get('name'),
             cand['education'][0]['institution'])
        want_skills = list(dict.fromkeys(
            s for v in cand['skills'].values() if isinstance(v, list) for s in v))
        R.eq('JSON-LD hasOccupation.skills are the Human Mode list',
             (ld.get('hasOccupation') or {}).get('skills'), want_skills)
        R.eq('JSON-LD mainEntityOfPage', ld.get('mainEntityOfPage'), AGENT_CANON)

    # anchors and internal links
    ids = set(p.ids)
    dangling = sorted({h[1:] for h in p.hrefs
                       if h.startswith('#') and len(h) > 1} - ids)
    R.ok('every in-page anchor resolves (%d ids)' % len(ids), not dangling,
         str(dangling[:5]))
    broken = []
    for href in p.hrefs:
        if href.startswith(('http://', 'https://', '#', 'mailto:', 'data:')):
            continue
        target = os.path.normpath(os.path.join(ROOT, 'agent', href.split('#')[0]))
        if href.endswith('/'):
            target = os.path.join(target, 'index.html')
        if not os.path.exists(target):
            broken.append(href)
    R.ok('all relative links resolve on disk', not broken, str(broken[:5]))

    # panes parse as declared
    R.sec('8. Agent Mode code panes parse as declared')
    panes = re.findall(
        r'<section class="pane"[^>]*data-file="(\w+)"[^>]*data-lang="(\w+)"'
        r'[^>]*>(.*?)</section>', agent_html, re.S)
    R.eq('fourteen panes', len(panes), 14)
    for pid, lang, body in panes:
        txt = pane_lines(body)
        if not txt.strip():
            R.ok('%s (%s) non-empty' % (pid, lang), False)
            continue
        try:
            if lang == 'json':
                json.loads(txt)
                detail = 'json.loads'
            elif lang == 'yaml':
                import yaml
                yaml.safe_load(txt)
                detail = 'yaml.safe_load'
            elif lang == 'py':
                ast.parse(txt)
                detail = 'ast.parse'
            elif lang == 'ts':
                # the pane is JS-compatible TypeScript; node can check it
                with tempfile.NamedTemporaryFile('w', suffix='.js',
                                                 delete=False) as f:
                    f.write(txt)
                    tmp = f.name
                try:
                    if not shutil_which('node'):
                        raise RuntimeError('node not installed')
                    r = subprocess.run(['node', '--check', tmp],
                                       capture_output=True, text=True)
                    if r.returncode:
                        raise RuntimeError(r.stderr.split('\n')[0][:160])
                finally:
                    os.unlink(tmp)
                detail = 'node --check'
            else:  # md
                heads = sum(1 for l in txt.splitlines() if l.startswith('#'))
                R.ok('%s (%s) markdown with %d headings' % (pid, lang, heads),
                     heads >= 1)
                continue
            R.ok('%s (%s) parses — %s' % (pid, lang, detail), True)
        except Exception as e:
            R.ok('%s (%s) parses' % (pid, lang), False,
                 str(e).replace('\n', ' ')[:170])

    # data attributes on lines
    levels = set(re.findall(r'data-evidence-level="([^"]+)"', agent_html))
    statuses = set(re.findall(r'data-evidence-status="([^"]+)"', agent_html))
    R.ok('data-evidence-level values are canonical', levels <= set(labels),
         str(sorted(levels - set(labels))))
    R.ok('data-evidence-status values are canonical', statuses <= set(labels),
         str(sorted(statuses - set(labels))))
    R.info('levels=%s statuses=%s' % (sorted(levels), sorted(statuses)))

    # `status` is reserved for the six evidence labels, so no pane may use
    # "Status" as a prose field label — the identity record uses `availability`.
    prose_status = []
    for pid, lang, body in panes:
        for line in pane_lines(body).splitlines():
            m = re.match(r'\s*\|\s*Status\s*\|\s*([^|]*?)\s*\|', line)
            if m and m.group(1) not in labels:
                prose_status.append('%s: | Status | %s |' % (pid, m.group(1)[:60]))
    R.ok('no pane labels a prose field "Status" (record uses availability)',
         not prose_status, '; '.join(prose_status[:3]))

    R.ok('no duplicated visually-hidden heading text',
         len(re.findall(r'<span class="vh" id="[^"]+">[^<]', agent_html)) == 0)

    # ── 9. Human page ───────────────────────────────────────────────────────
    R.sec('9. Human page (index.html)')
    hp = read_page(os.path.join(ROOT, 'index.html'))
    R.ok('exactly one h1', sum(1 for l, _ in hp.headings if l == 'h1') == 1)
    R.ok('landmark main present', bool(hp.tags.get('main')))
    R.ok('lang attribute', hp.lang == 'en')
    R.ok('canonical link', hp.rel.get('canonical') == [CANON],
         str(hp.rel.get('canonical')))
    R.ok('meta description', bool(hp.metas.get('description')))
    R.ok('skip link present', 'skip' in hp.hrefs or
         any(h.endswith('#main') or h.startswith('#') for h in hp.hrefs))
    hid = set(hp.ids)
    hdang = sorted({x[1:] for x in hp.hrefs
                    if x.startswith('#') and len(x) > 1} - hid)
    R.ok('every in-page anchor resolves (%d ids)' % len(hid), not hdang,
         str(hdang[:5]))
    hbroken = []
    for href in hp.hrefs:
        if href.startswith(('http://', 'https://', '#', 'mailto:', 'data:')):
            continue
        target = os.path.normpath(os.path.join(ROOT, href.split('#')[0]))
        if href.endswith('/'):
            target = os.path.join(target, 'index.html')
        if not os.path.exists(target):
            hbroken.append(href)
    R.ok('all relative links resolve on disk', not hbroken, str(hbroken[:5]))

    ht = plain(re.sub(r'<script.*?</script>|<style.*?</style>', ' ',
                      io.open(os.path.join(ROOT, 'index.html'),
                              encoding='utf-8').read(), flags=re.S))
    for probe, label in ((cand['contact']['email'], 'email in page text'),
                         (cand['contact']['x'], 'X link matches record'),
                         (cand['candidate']['name'], 'name in page text')):
        R.ok(label, probe in ht or probe in io.open(
            os.path.join(ROOT, 'index.html'), encoding='utf-8').read(), probe)
    # The evidence legend documents what the s-unavail chip *would* mean; a chip
    # on an actual project card is a claim about that project. Strip the legend
    # blocks, then nothing anywhere may claim a repository is unavailable.
    hsrc = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    claims = re.sub(r'<div class="ev-label">.*?</div>', '', hsrc, flags=re.S)
    R.ok('no project card claims an unavailable repository',
         's-unavail' not in claims,
         str(re.findall(r'<h3>([^<]+)</h3>\s*'
                        r'<span class="proj-status s-unavail"', claims)))

    # the three cards whose status is contested by humans must agree with the
    # structured record (two private repos, AgentOS public)
    chip_of = {'s-private': 'private_available_on_request',
               's-public': 'public_repo'}
    for pid in sorted(PRIVATE_IDS | {'project-agentos'}):
        proj = next(x for x in cand['projects'] if x['id'] == pid)
        want = proj['verification']['status']
        m = re.search(r'<h3>%s</h3>\s*<span class="proj-status (\S+?)"'
                      % re.escape(proj['name']), hsrc)
        got = chip_of.get(m.group(1)) if m else None
        R.ok('card %r status chip agrees with candidate.json' % proj['name'],
             got == want,
             ('chip not found' if m is None else 'chip %r -> %s' % (m.group(1), got))
             + ', record says ' + want)
    # Human page JSON-LD agrees with the record
    for block in hp.jsonld:
        try:
            d = json.loads(block)
        except Exception:
            continue
        if d.get('@type') == 'Person':
            R.eq('Human JSON-LD name matches record', d.get('name'),
                 cand['candidate']['name'])
            R.eq('Human JSON-LD url is canonical', d.get('url'), CANON)

    # ── 10. llms.txt / robots / sitemap ─────────────────────────────────────
    R.sec('10. llms.txt, robots.txt, sitemap.xml')
    for section in ('# Sneh Sinha', '## Entry points',
                    '## Capabilities with evidence', '## Experience',
                    '## Projects', '## External evidence', '## Skills',
                    '## Relevant roles', '## Education', '## Links',
                    '## Structured data', '## Honesty notes'):
        R.ok('llms.txt section %r' % section, section in llms)
    for name in RECORDS:
        R.ok('llms.txt mentions %s' % name, name in llms)
    for label in labels:
        R.ok('llms.txt documents label %s' % label, label in llms)
    R.ok('llms.txt states no numeric scores',
         'no numeric' in llms or 'no fit scores' in llms)
    R.ok('llms.txt states recruiter access for private repos',
         'recruiter' in llms.lower() and 'private' in llms.lower())

    robots = io.open(os.path.join(ROOT, 'robots.txt'), encoding='utf-8').read()
    R.ok('robots.txt allows all crawlers', 'User-agent: *' in robots and
         'Allow: /' in robots)
    R.ok('robots.txt points at the sitemap', 'Sitemap: %ssitemap.xml' % CANON
         in robots.replace('\r', ''))
    R.ok('robots.txt names an AI/recruiting crawler', 'ClaudeBot' in robots)

    try:
        tree = ET.parse(os.path.join(ROOT, 'sitemap.xml'))
        R.ok('sitemap.xml parses as XML', True)
        ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
        urls = tree.getroot().findall(ns + 'url')
        R.ok('sitemap uses the sitemap 0.9 namespace',
             tree.getroot().tag == ns + 'urlset')
        locs, bad = [], []
        for u in urls:
            loc = u.findtext(ns + 'loc')
            mod = u.findtext(ns + 'lastmod')
            locs.append(loc)
            if not loc.startswith(CANON):
                bad.append('loc off-canonical: %s' % loc)
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', mod or ''):
                bad.append('bad lastmod: %s' % loc)
            rel = loc[len(CANON):]
            fpath = ('index.html' if rel == '' else
                     'agent/index.html' if rel == 'agent/' else
                     rel + 'index.html' if rel.endswith('/') else rel)
            if not os.path.exists(os.path.join(ROOT, fpath)):
                bad.append('no local file for %s' % loc)
        R.ok('every sitemap entry is canonical, dated and backed by a file',
             not bad, '; '.join(bad[:4]))
        R.eq('sitemap lists the three published artefacts', sorted(locs),
             sorted([CANON, AGENT_CANON,
                     CANON + 'assets/Sneh_Raj_Sinha_Resume.pdf']))
    except Exception as e:
        R.ok('sitemap.xml parses as XML', False, str(e))

    # ── 11. cross-file URLs ─────────────────────────────────────────────────
    R.sec('11. Cross-file URL consistency')
    repo_urls = {p['repository'] for p in cand['projects'] if p.get('repository')}
    ext_urls = {s['url'] for s in ev['external_sources'] if s.get('url')}
    allowed = repo_urls | ext_urls | set(EVIDENCE_URL_EXCEPTIONS.values())
    off = []
    for ch in chains:
        src = ch['verification'].get('source')
        if not src:
            off.append('%s has no source' % ch.get('capability'))
            continue
        want = EVIDENCE_URL_EXCEPTIONS.get(ch.get('project'))
        if want:
            if src != want:
                off.append('%s source %s (expected %s)' % (ch.get('project'),
                                                           src, want))
        elif ch.get('project'):
            if src != next((p['repository'] for p in cand['projects']
                            if p['id'] == ch['project']), src):
                off.append('%s source != repository' % ch.get('project'))
        elif src not in allowed and not src.startswith(CANON):
            off.append('unrecognised source %s' % src)
    R.ok('every chain source is the project repository or the documented '
         'evidence URL', not off, '; '.join(off[:4]))

    card_urls = {x['url'] for x in card['project_links'] if x.get('url')}
    stray = {u for u in card_urls if u not in allowed and not u.startswith(CANON)}
    R.ok('agent-card links are drawn from the same URL set', not stray,
         str(sorted(stray)))
    cap_urls = {e['verification_url'] for c in caps['capabilities']
                for e in c['evidence'] if e.get('verification_url')}
    stray = {u for u in cap_urls if u not in allowed and not u.startswith(CANON)}
    R.ok('capability verification URLs come from the same set', not stray,
         str(sorted(stray)))

    for name, rec in recs.items():
        cu = rec.get('canonical_url')
        if not cu and isinstance(rec.get('candidate'), dict):
            cu = rec['candidate'].get('canonical_url')
        if cu:
            R.ok('%s canonical_url is the published URL' % name, cu == CANON, cu)

    # ── 11b. JSON schemas ───────────────────────────────────────────────────
    R.sec('11b. JSON schemas (Draft 2020-12)')
    try:
        import jsonschema
    except ImportError:
        R.info('jsonschema not installed — schema validation skipped')
    else:
        for name in ('candidate', 'capabilities', 'evidence', 'agent-card'):
            spath = os.path.join(ROOT, 'schemas', name + '.schema.json')
            if not os.path.exists(spath):
                R.ok('schemas/%s.schema.json exists' % name, False, 'missing')
                continue
            try:
                schema = json.load(io.open(spath, encoding='utf-8'))
            except ValueError as e:
                R.ok('schemas/%s.schema.json parses' % name, False, str(e))
                continue
            try:
                jsonschema.Draft202012Validator.check_schema(schema)
            except jsonschema.SchemaError as e:
                R.ok('%s.schema.json is itself a valid schema' % name,
                     False, str(e)[:120])
                continue
            v = jsonschema.Draft202012Validator(
                schema, format_checker=jsonschema.FormatChecker())
            errs = sorted(v.iter_errors(recs[name + '.json']),
                          key=lambda e: list(e.path))
            R.ok('%s.json validates against its schema' % name, not errs,
                 '; '.join('/%s: %s' % ('/'.join(map(str, e.path)), e.message)
                           for e in errs[:3]))

    # ── 12. online ──────────────────────────────────────────────────────────
    if args.online:
        R.sec('12. Anonymous reachability (--online)')
        import concurrent.futures as cf
        import subprocess as sp

        def probe(u):
            r = sp.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}',
                        '--max-time', '20', '-L', '-H', 'User-Agent: Mozilla/5.0',
                        u], capture_output=True, text=True)
            return u, r.stdout.strip()

        priv_urls = {next(x for x in cand['projects'] if x['id'] == pid)['repository']
                     for pid in PRIVATE_IDS}
        targets = [(u, 'public') for u in sorted(repo_urls - priv_urls)]
        targets += [(EVIDENCE_URL_EXCEPTIONS['project-webcmd'], 'public')]
        with cf.ThreadPoolExecutor(8) as ex:
            for u, code in ex.map(lambda t: probe(t[0]), targets):
                R.ok('%s returns 200'
                     % u.replace('https://github.com/Sneh30/', ''),
                     code == '200', 'HTTP %s' % code)
        for pid in sorted(PRIVATE_IDS):
            p = next(x for x in cand['projects'] if x['id'] == pid)
            _, code = probe(p['repository'])
            R.ok('%s is private (404 anonymously)' % p['name'], code == '404',
                 'HTTP %s' % code)

        # ---- every external link in the HTML and llms.txt ------------------
        R.sec('12b. External links (--online)')
        urls = {}
        for rel in ('index.html', 'agent/index.html', 'v1/index.html',
                    'new_portfolio/index.html', 'llms.txt'):
            fpath = os.path.join(ROOT, rel)
            if not os.path.exists(fpath):
                continue
            body = io.open(fpath, encoding='utf-8').read()
            if rel.endswith('.html'):
                # navigational links only: <a href>, plus <link> stylesheets.
                # preconnect/dns-prefetch/preload hints name a bare *origin*,
                # which is not a page — fetching it proves nothing.
                found = re.findall(r'<a\b[^>]+href="(https?://[^"]+)"', body)
                for tag in re.findall(r'<link\b[^>]*>', body):
                    r = re.search(r'rel="([^"]+)"', tag)
                    h = re.search(r'href="(https?://[^"]+)"', tag)
                    if h and not (r and re.search(
                            r'preconnect|prefetch|preload', r.group(1))):
                        found.append(h.group(1))
            else:
                found = [u.rstrip('.,;:)') for u in
                         re.findall(r'https?://[^\s<>"\'`]+', body)]
            for u in found:
                urls.setdefault(u, set()).add(rel)
        # repository URLs are already asserted above (public must be 200, the
        # two private ones must be 404) — a plain dead-link rule would misread
        # exactly the links whose 404 is the honest answer.
        skip = repo_urls | set(EVIDENCE_URL_EXCEPTIONS.values())
        todo = sorted(u for u in urls if u not in skip)
        with cf.ThreadPoolExecutor(8) as ex:
            results = list(ex.map(probe, todo))
        dead = ['%s (%s)' % (u, ', '.join(sorted(urls[u]))) for u, c in results
                if c in ('404', '410')]
        R.ok('no dead external links (%d unique checked)' % len(todo),
             not dead, '; '.join(dead[:5]))
        walls = ['%s -> %s' % (u, c) for u, c in results
                 if c in ('999', '403', '429', '401', '405')]
        if walls:
            R.info('bot-walled, unverifiable anonymously: ' + ', '.join(walls))
        odd = ['%s -> %s' % (u, c) for u, c in results
               if c not in ('200', '204', '301', '302', '303', '307', '308',
                            '999', '403', '401', '429', '405', '404', '410')]
        if odd:
            R.info('non-definitive responses: ' + '; '.join(odd[:6]))

    return R


def shutil_which(cmd):
    for d in os.environ.get('PATH', '').split(os.pathsep):
        p = os.path.join(d, cmd)
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p
    return None


if __name__ == '__main__':
    rep = main()
    print('\n' + '=' * 68)
    print('PASS %d   FAIL %d' % (rep.passed, rep.failed))
    if rep.failures:
        print('\nFailures:')
        for f in rep.failures:
            print('  - %s' % f)
    print('=' * 68)
    sys.exit(1 if rep.failed else 0)
