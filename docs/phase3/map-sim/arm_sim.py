"""Persistent-arm simulator for docs/phase3/02-map.md (section 3.12-3.13).

Simulates many consecutive runs on one hand-placed arm. Between runs the arm is
updated (done / aged / resolved / reported home) instead of rolled fresh, and the
"steady arm" rule keeps the arm's shape. Compares against a fresh roll per run.

Usage: python3 arm_sim.py [runs] [chains]
"""
import math
import random
import statistics as st
import sys

# ---- the arm (02-map.md section 3.2) ----
POS = {
    0: (8, 0), 1: (33, -10), 2: (29, 4), 3: (30, 16), 4: (54, 1), 5: (54, 10), 6: (53, 24),
    7: (81, 13), 8: (75, 21), 9: (73, 35), 10: (100, 29), 11: (98, 43), 12: (91, 52),
    13: (121, 51), 14: (114, 62), 15: (107, 72), 16: (136, 78), 17: (128, 90), 18: (121, 96),
    19: (138, 116),
}
LAYER = {0: 1, 19: 8}
for s in range(1, 19):
    LAYER[s] = (s - 1) // 3 + 2
SLOTS_BY_LAYER = {k: [s for s in POS if LAYER[s] == k] for k in range(1, 9)}
FIRST, FINAL = 0, 19
AUTHORED = {2: 'HALCYON', 5: 'KESTREL', 11: 'VESPER'}


def dist(a, b):
    (x1, y1), (x2, y2) = POS[a], POS[b]
    return round(math.hypot(x1 - x2, y1 - y2))


def sol(a):
    x, y = POS[a]
    return round(math.hypot(x, y))


D = {(a, b): dist(a, b) for a in POS for b in POS}

# ---- tuning (02-map.md section 3.3-3.4) ----
BEAM_RANGE = 58
LS = {1: 30, 2: 90, 3: 120, 4: 75, 5: 80, 6: 85, 7: 90}  # LAYER_SLACK(k): hop out of layer k
ARK_MARGIN = 12
LL_MARGIN = 20
LIGHT_SHARE = 0.4
# the launch gap (DECISIONS round 2, 4 + 13): 0-35 years, weighted to short gaps, mean 2-3 years
GAP_TABLE = [(0, 10), (1, 35), (2, 25), (3, 12), (5, 10), (10, 6), (20, 1.5), (35, 0.5)]  # (years, % of launches)
DRIFT_LIMIT = 10        # a waiting ship more than this many years off the new schedule leaves
VALVE_YEARS = 11        # the time valve: extra years, so every waiting ship passes DRIFT_LIMIT
VALVE_FLOOR = 63        # pods: the valve opens when the updated arm's best route is below this (the fresh roll's 1st percentile)
MAX_LATE_TIGHT = 2      # TIGHT ships per layer from layer 5 (round 2, 7)

# persistent-arm knobs (new)
MAX_AGE = 3             # a skipped ship stays at most this many runs on the chart
RESOLVE_CHANCE = 0.2    # per run, a skipped generated ship is saved by another core / lands on its own
ARK_FROM_NEIGHBOURS = True  # ark year from the real ships of the layer before (needed once ships persist)
TIGHT_FROM_LAYER = 5
CHECK_TIGHT = True
TIGHT_COST = 2          # pods a late TIGHT ship is worth less (files or charge left behind), for the route check
FAIL_P = 0.15           # share of runs that end before the final ship


def bases(start):
    b = {1: start}
    for k in range(1, 8):
        b[k + 1] = b[k] + (22 if k == 1 else 25) + LS[k]
    return b


def pods_for(kind, layer):
    if kind == 'light':
        return 3 + layer // 3
    if kind == 'std':
        return 3 + layer
    if kind == 'ark':
        return min(16, round(2.2 * (4 + layer)))
    if kind == 'first':
        return 3
    if kind == 'final':
        return 16


def roll_timing(rng, ship, b):
    k = ship['layer']
    j = rng.randint(-4, 4)
    if ship['kind'] == 'ark':
        # placeholder; set by ark_year() once the layer before is known
        ship['A'] = b[k] - LS[k - 1] - ARK_MARGIN + j
    else:
        late = rng.random() < 0.5
        off = (0.3 if k == 2 else 0.5) if late else 0.0
        ship['A'] = b[k] + round(off * LS[k - 1]) + j
        ship['late'] = late


def new_ship(rng, slot, kind, b, run):
    s = {'slot': slot, 'layer': LAYER[slot], 'kind': kind, 'age': 0, 'born': run, 'born_start': b[1],
         'authored': False, 'late': False}
    s['pods'] = pods_for(kind, s['layer'])
    if kind == 'first':
        s['A'] = b[1]
    elif kind != 'final':
        roll_timing(rng, s, b)
    return s


def mem_class(ship):
    """01-landing.md: light TIGHT (256, room 88); standard 5-8 pods and the first ship COMPACT (320, room 152);
    9+ pods, arks and the final ship FULL (384, room 152)."""
    if ship['kind'] == 'light':
        return 'TIGHT'
    if ship['kind'] in ('ark', 'final') or ship['pods'] >= 9:
        return 'FULL'
    return 'COMPACT'


def late_tight(arm, s):
    return LAYER[s] >= TIGHT_FROM_LAYER and mem_class(arm[s]) == 'TIGHT'


def reach(arm, a, b):
    sa, sb = arm[a], arm[b]
    if sa is None or sb is None:
        return False
    if LAYER[b] <= LAYER[a]:
        return False
    d = D[(a, b)]
    return d <= BEAM_RANGE and sa['A'] + d <= sb['A']


def ark_year(rng, arm, s):
    """An ark approaches ARK_MARGIN (+0..4) years before any ship of the layer before could reach it."""
    k = LAYER[s]
    earliest = min(arm[p]['A'] + D[(p, s)] for p in SLOTS_BY_LAYER[k - 1]
                   if arm[p] is not None and D[(p, s)] <= BEAM_RANGE)
    arm[s]['A'] = earliest - ARK_MARGIN - rng.randint(0, 4)


def set_final_year(arm, floor=None):
    """floor: the last final ship's year + max(gap, 1), so two final ships never share a year at one end."""
    best = 0
    for s in POS:
        if s != FINAL and arm[s] and D[(s, FINAL)] <= BEAM_RANGE:
            best = max(best, arm[s]['A'] + D[(s, FINAL)])
    y = best + LL_MARGIN
    y = int(math.ceil(y / 5.0) * 5)
    if floor is not None:
        y = max(y, floor)
    arm[FINAL]['A'] = y


def check(arm):
    """Return list of (problem, slot) for the four validity checks."""
    bad = []
    for s in POS:
        if arm[s] is None:
            bad.append(('empty', s))
            continue
        if s != FINAL and not any(reach(arm, s, t) for t in POS):
            bad.append(('no-successor', s))
        if s != FIRST and not any(reach(arm, p, s) for p in POS):
            bad.append(('no-predecessor', s))
        if arm[s]['kind'] == 'ark':
            for p in SLOTS_BY_LAYER[LAYER[s] - 1]:
                if reach(arm, p, s):
                    bad.append(('ark-one-hop', s))
                    bad.append(('ark-one-hop-from', p))
        if LAYER[s] == 7 and not reach(arm, s, FINAL):
            bad.append(('no-final', s))
    if bad or not CHECK_TIGHT:
        return bad
    # 5. no ship forces a route through a TIGHT ship from layer 5 on
    clear = {FINAL: True}
    for s in sorted(POS, key=lambda x: -LAYER[x]):
        if s == FINAL:
            continue
        clear[s] = any(reach(arm, s, t) and clear[t] and not late_tight(arm, t) for t in POS)
        if not clear[s] and not late_tight(arm, s):
            bad.append(('forced-tight', s))
    return bad


# ---- fresh roll (the old per-wave generator, baseline) ----
def fresh_arm(rng, run, start):
    b = bases(start)
    for attempt in range(1, 51):
        arm = {s: None for s in POS}
        pattern = (3, 5, 7) if rng.random() < 0.5 else (4, 6)
        arm[FIRST] = new_ship(rng, FIRST, 'first', b, run)
        for k in range(2, 8):
            ark_slot = rng.choice(SLOTS_BY_LAYER[k]) if k in pattern else None
            for s in SLOTS_BY_LAYER[k]:
                if s == ark_slot:
                    kind = 'ark'
                else:
                    kind = 'light' if rng.random() < LIGHT_SHARE else 'std'
                    if kind == 'light' and k >= TIGHT_FROM_LAYER and sum(
                            1 for x in SLOTS_BY_LAYER[k] if arm[x] and arm[x]['kind'] == 'light') >= MAX_LATE_TIGHT:
                        kind = 'std'
                arm[s] = new_ship(rng, s, kind, b, run)
            if ark_slot is not None and ARK_FROM_NEIGHBOURS:
                ark_year(rng, arm, ark_slot)
        arm[FINAL] = new_ship(rng, FINAL, 'final', b, run)
        set_final_year(arm)
        if not check(arm):
            return arm, attempt
    raise RuntimeError('fresh roll: 50 attempts')


# ---- the update between runs (new) ----
def roll_gap(rng):
    r = rng.random() * 100
    for years, w in GAP_TABLE:
        if r < w:
            return years
        r -= w
    return GAP_TABLE[-1][0]


def update_arm(rng, prev, visited, run, start, stats, gap=1):
    """prev: last run's arm; visited: slots the last unit visited."""
    b = bases(start)
    arm = {}
    reasons = stats.setdefault('reasons', {})

    def resolve(s, why):
        arm[s] = None
        reasons[why] = reasons.get(why, 0) + 1

    # 1-2. done, replaced, aged, resolved
    for s in POS:
        ship = prev[s]
        if s in visited:
            arm[s] = None
            reasons['done'] = reasons.get('done', 0) + 1
            continue
        if s == FIRST:
            arm[s] = None  # the first ship's approach is behind the new unit: always a new one
            reasons['first-past'] = reasons.get('first-past', 0) + 1
            continue
        ship = dict(ship)
        ship['age'] += 1
        arm[s] = ship
        if start - ship['born_start'] > DRIFT_LIMIT:
            resolve(s, 'drifted')
            continue
        if s == FINAL:
            continue
        if ship['age'] >= MAX_AGE:
            resolve(s, 'aged')
        elif not ship['authored'] and rng.random() < RESOLVE_CHANCE:
            resolve(s, 'resolved')

    # 3. the ark pattern: keep the one the persisting arks fit best
    arks = {LAYER[s] for s in POS if arm[s] and arm[s]['kind'] == 'ark'}
    forced = {LAYER[s] for s in POS if arm[s] and arm[s]['kind'] == 'ark' and arm[s]['authored']}
    a, c = len(arks & {3, 5, 7}), len(arks & {4, 6})
    if forced:
        pattern = (3, 5, 7) if forced & {3, 5, 7} else (4, 6)
    elif a != c:
        pattern = (3, 5, 7) if a > c else (4, 6)
    else:
        pattern = (3, 5, 7) if rng.random() < 0.5 else (4, 6)
    for s in POS:
        if arm[s] and arm[s]['kind'] == 'ark' and LAYER[s] not in pattern:
            resolve(s, 'off-pattern-ark')
    want_ark = set()
    for k in pattern:
        if any(arm[s] and arm[s]['kind'] == 'ark' for s in SLOTS_BY_LAYER[k]):
            continue
        empty = [s for s in SLOTS_BY_LAYER[k] if arm[s] is None]
        if not empty:
            cands = [s for s in SLOTS_BY_LAYER[k] if not arm[s]['authored']]
            oldest = max(arm[s]['age'] for s in cands)
            victim = rng.choice([s for s in cands if arm[s]['age'] == oldest])
            resolve(victim, 'made-room-for-ark')
            empty = [victim]
        want_ark.add(rng.choice(empty))

    # 4. reported home: refill every empty slot, holding the light share
    def refill_plan():
        plan = {}
        for s in POS:
            if arm[s] is not None:
                continue
            if s == FIRST:
                plan[s] = 'first'
            elif s == FINAL:
                plan[s] = 'final'
            elif s in want_ark:
                plan[s] = 'ark'
            else:
                plan[s] = None
        open_slots = [s for s in plan if plan[s] is None]
        non_ark = [s for s in POS if 2 <= LAYER[s] <= 7 and not (
            (arm[s] and arm[s]['kind'] == 'ark') or plan.get(s) == 'ark')]
        target = round(LIGHT_SHARE * len(non_ark))
        have = sum(1 for s in POS if arm[s] and arm[s]['kind'] == 'light')
        need = max(0, min(len(open_slots), target - have))
        rng.shuffle(open_slots)
        for s in open_slots:
            k = LAYER[s]
            crowded = k >= TIGHT_FROM_LAYER and sum(
                1 for x in SLOTS_BY_LAYER[k]
                if (arm[x] and arm[x]['kind'] == 'light') or plan.get(x) == 'light') >= MAX_LATE_TIGHT
            if need > 0 and not crowded:
                plan[s] = 'light'
                need -= 1
            else:
                plan[s] = 'std'
        return plan

    arm_kind_before = {s: (arm[s]['kind'] if arm[s] else None) for s in POS}
    plan = refill_plan()
    for attempt in range(1, 51):
        trial = dict(arm)
        for s, kind in plan.items():
            trial[s] = new_ship(rng, s, kind, b, run)
        if ARK_FROM_NEIGHBOURS:
            for s in sorted(plan, key=lambda x: LAYER[x]):
                if plan[s] == 'ark':
                    ark_year(rng, trial, s)
        if plan.get(FINAL):
            set_final_year(trial, prev[FINAL]['A'] + max(gap, 1))
        bad = check(trial)
        if not bad:
            stats['attempts'] = attempt
            stats['refills'] = len(plan)
            return trial
        # after 5 failed attempts, a persisting ship that is part of the problem resolves
        if attempt >= 5:
            if any(w == 'forced-tight' for w, _ in bad):
                late_planned = [x for x in plan if plan[x] == 'light' and LAYER[x] >= TIGHT_FROM_LAYER]
                if late_planned:
                    plan[rng.choice(late_planned)] = 'std'
                for s in ([] if late_planned else POS):
                    if s not in plan and arm[s] and late_tight(arm, s):
                        resolve(s, 'unreachable')
                        plan[s] = 'std'
                        break
            for why, s in bad:
                if why == 'no-predecessor' and s in plan and attempt >= 10:
                    # a new ship nobody can reach: one persisting ship that could feed it makes room
                    feeders = [p for p in POS if p not in plan and arm[p] and p not in (FIRST, FINAL)
                               and 1 <= LAYER[s] - LAYER[p] <= 2 and D[(p, s)] <= BEAM_RANGE]
                    if feeders:
                        f = rng.choice(feeders)
                        resolve(f, 'unreachable')
                        plan[f] = 'light' if (rng.random() < LIGHT_SHARE and LAYER[f] < TIGHT_FROM_LAYER) else 'std'
                    continue
                if why == 'forced-tight':
                    continue
                if s in plan or arm[s] is None or s in (FIRST, FINAL):
                    continue
                resolve(s, 'unreachable')
                plan[s] = 'ark' if arm_kind_before.get(s) == 'ark' else (
                    'light' if rng.random() < LIGHT_SHARE else 'std')
            if plan.get(FINAL) is None and any(w == 'no-final' and s not in plan for w, s in bad):
                pass
    raise RuntimeError(f'update: 50 attempts {bad} plan={plan}')


def first_arm(rng, run, start):
    arm, att = fresh_arm(rng, run, start)
    for s, name in AUTHORED.items():
        arm[s]['authored'] = True
    arm[FIRST]['authored'] = True
    arm[FINAL]['authored'] = True
    return arm, att


# ---- routes ----
def routes(arm):
    out = []

    def walk(s, path, pods):
        if s == FINAL:
            out.append((list(path), pods))
            return
        nxt = [t for t in POS if reach(arm, s, t)]
        for t in nxt:
            path.append(t)
            walk(t, path, pods + arm[t]['pods'])
            path.pop()
    walk(FIRST, [FIRST], arm[FIRST]['pods'])
    return out


def value(arm, r):
    return sum(arm[s]['pods'] - (TIGHT_COST if late_tight(arm, s) else 0) for s in r)


def pick_route(rng, arm, rts, policy):
    if policy == 'best':
        top = max(p for _, p in rts)
        return rng.choice([r for r, p in rts if p == top])
    if policy == 'shortest-best':
        n = min(len(r) for r, _ in rts)
        top = max(p for r, p in rts if len(r) == n)
        return rng.choice([r for r, p in rts if len(r) == n and p == top])
    # random walk: every hop picked evenly among the reachable ships
    path = [FIRST]
    while path[-1] != FINAL:
        nxt = [t for t in POS if reach(arm, path[-1], t)]
        path.append(rng.choice(nxt))
    return path


def request_ok(arm, s0, s1):
    detour = sol(s0) + sol(s1) - D[(s0, s1)]
    slack = arm[s1]['A'] - arm[s0]['A'] - D[(s0, s1)]
    return detour <= slack


def summarize(arm, rts):
    best = max(p for _, p in rts)
    lens = {}
    for r, p in rts:
        n = len(r)
        lens[n] = max(lens.get(n, 0), p)
    best_len = [n for n in sorted(lens) if lens[n] == best]
    on_route = set(s for r, _ in rts for s in r)
    vals = [(r, value(arm, r)) for r, _ in rts]
    vbest = max(v for _, v in vals)
    vroute = [r for r, v in vals if v == vbest][0]
    broute = [r for r, p in rts if p == best][0]
    arks = sum(1 for s in POS if arm[s]['kind'] == 'ark')
    lights = sum(1 for s in POS if arm[s]['kind'] == 'light')
    return {'best': best, 'best_len': best_len[0], 'lens': lens, 'n_routes': len(rts),
            'reachable': len(on_route), 'arks': arks, 'lights': lights,
            'span': arm[FINAL]['A'] - arm[FIRST]['A'],
            'cost_len': len(vroute), 'tight_on_best': any(late_tight(arm, x) for x in broute),
            'tight_on_costbest': any(late_tight(arm, x) for x in vroute),
            'late_tight': sum(1 for x in POS if late_tight(arm, x)),
            'classes': [mem_class(arm[x]) for x in POS]}


def chain(seed, runs, policy, persistent=True):
    rng = random.Random(seed)
    rows = []
    arm, att = first_arm(rng, 1, 2300)
    start = 2300
    for n in range(1, runs + 1):
        stats = {'attempts': att, 'refills': 20, 'reasons': {}, 'gap': 0, 'valve': False}
        if n > 1:
            gap = roll_gap(rng)
            stats['gap'] = gap
            if persistent:
                new = update_arm(rng, arm, visited, n, start + gap, stats, gap)
                if max(p for _, p in routes(new)) < VALVE_FLOOR:
                    # the time valve: the next launch waits until every waiting ship has moved on
                    gap += VALVE_YEARS
                    stats = {'attempts': 0, 'refills': 20, 'reasons': {}, 'gap': gap, 'valve': True}
                    new = update_arm(rng, arm, visited, n, start + gap, stats, gap)
                arm = new
                start += gap
            else:
                start += gap
                arm, att = fresh_arm(rng, n, start)
                stats['attempts'] = att
        rts = routes(arm)
        row = summarize(arm, rts)
        pol = policy if policy != 'mix' else rng.choice(['best', 'random'])
        route = pick_route(rng, arm, rts, pol)
        if rng.random() < FAIL_P:
            cut = rng.randint(2, len(route) - 1)
            route = route[:cut]
            row['failed'] = True
        row['taken'] = sum(arm[s]['pods'] for s in route)
        row['route_len'] = len(route)
        row['req23'] = request_ok(arm, route[1], route[2]) if len(route) > 2 else None
        row['persisting'] = sum(1 for s in POS if arm[s]['age'] > 0) if n > 1 else 0
        row['ages'] = [arm[s]['age'] for s in POS if s not in (FIRST, FINAL)]
        row['stats'] = stats
        row['authored_left'] = sum(1 for s in AUTHORED if arm[s]['authored'])
        row['final_new'] = arm[FINAL]['born'] == n
        row['final_year'] = arm[FINAL]['A']
        row['gap'] = stats['gap']
        row['valve'] = stats['valve']
        row['start'] = start
        rows.append(row)
        visited = set(route)
    return rows


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return num / den if den else 0.0


def report(label, rows_by_chain):
    rows = [r for ch in rows_by_chain for r in ch]
    best = [r['best'] for r in rows]
    print(f'== {label}: {len(rows_by_chain)} chains x {len(rows_by_chain[0])} runs = {len(rows)} runs')
    print(f'  best route pods: median {st.median(best)}, p1 {pct(best, .01)}, p10 {pct(best, .1)}, p90 {pct(best, .9)}, '
          f'min {min(best)}, max {max(best)}  (x200 colonists)')
    bl = {}
    for r in rows:
        bl[r['best_len']] = bl.get(r['best_len'], 0) + 1
    print('  best route length: ' + ', '.join(f'{k}: {100*v/len(rows):.0f}%' for k, v in sorted(bl.items())))
    # every length's best as a share of the run's best
    for n in (5, 6, 7, 8):
        sh = [r['lens'][n] / r['best'] for r in rows if n in r['lens']]
        have = len(sh) / len(rows)
        if sh:
            print(f'  best {n}-ship route / run best: median {st.median(sh):.2f}, p10 {pct(sh, .1):.2f}'
                  f'  (exists in {100*have:.0f}% of runs)')
    cl = {}
    for r in rows:
        cl[r['cost_len']] = cl.get(r['cost_len'], 0) + 1
    print('  with the TIGHT cost, best route length: ' + ', '.join(
        f'{k}: {100*v/len(rows):.0f}%' for k, v in sorted(cl.items())))
    print(f'  late TIGHT ships per arm: mean {st.mean(r["late_tight"] for r in rows):.2f}; on the best route: '
          f'{100*sum(r["tight_on_best"] for r in rows)/len(rows):.0f}% (no cost), '
          f'{100*sum(r["tight_on_costbest"] for r in rows)/len(rows):.0f}% (with cost)')
    allc = [c for r in rows for c in r['classes']]
    print('  memory classes: ' + ', '.join(f'{k} {100*allc.count(k)/len(allc):.0f}%' for k in ('FULL', 'COMPACT', 'TIGHT')))
    rc = [r['reachable'] for r in rows]
    nr = [r['n_routes'] for r in rows]
    print(f'  ships on some route: median {st.median(rc)}, min {min(rc)};  routes: median {st.median(nr)}, '
          f'min {min(nr)}, max {max(nr)}')
    spans = [r['span'] for r in rows]
    print(f'  run span (first ship to final ship): median {st.median(spans)}, p10 {pct(spans,.1)}, p90 {pct(spans,.9)}')
    req = [r['req23'] for r in rows if r['req23'] is not None]
    print(f'  request from ship 2 reaches ship 3 (route taken): {100*sum(req)/len(req):.0f}%')
    att = [r['stats']['attempts'] for r in rows]
    print(f'  attempts: first try {100*sum(1 for a in att if a == 1)/len(att):.1f}%, max {max(att)}')
    # drift over the chain
    nrun = len(rows_by_chain[0])
    blocks = [(i, min(i + nrun // 5, nrun)) for i in range(0, nrun, max(1, nrun // 5))]
    print('  best pods by run block: ' + ', '.join(
        f'{a+1}-{b}: {st.mean(ch[i]["best"] for ch in rows_by_chain for i in range(a, b)):.1f}' for a, b in blocks))
    # snowball: what the last run took vs this run's best
    took, nxt = [], []
    for ch in rows_by_chain:
        for i in range(len(ch) - 1):
            took.append(ch[i]['taken'])
            nxt.append(ch[i + 1]['best'])
    print(f'  corr(pods taken last run, best pods this run): {corr(took, nxt):+.3f}')
    if rows[1].get('persisting') is not None:
        pers = [r['persisting'] for r in rows[1:]]
        refills = [r['stats']['refills'] for r in rows if r['stats'].get('reasons')]
        print(f'  ships carried over at run start: median {st.median(pers)}, p10 {pct(pers,.1)}, p90 {pct(pers,.9)}'
              f' of 20;  new ships per run: median {st.median(refills) if refills else 0}')
        reasons = {}
        for r in rows:
            for k, v in r['stats'].get('reasons', {}).items():
                reasons[k] = reasons.get(k, 0) + v
        n_upd = sum(1 for r in rows if r['stats'].get('reasons'))
        if n_upd:
            print('  leaving the chart per run: ' + ', '.join(
                f'{k} {v/n_upd:.2f}' for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])))
        ages = [a for r in rows for a in r['ages']]
        print('  age of ships at run start: ' + ', '.join(
            f'{k}: {100*ages.count(k)/len(ages):.0f}%' for k in sorted(set(ages))))
        lights = [r['lights'] for r in rows]
        arks = [r['arks'] for r in rows]
        print(f'  lights per arm: mean {st.mean(lights):.2f}; arks per arm: mean {st.mean(arks):.2f}')
        fn = sum(1 for r in rows if r['final_new'])
        gaps = [r['gap'] for r in rows if r['stats'].get('reasons')]
        if gaps:
            print(f'  launch gap: mean {st.mean(gaps):.2f}, median {st.median(gaps)}, max {max(gaps)};  time valve opened in '
                f'{100*sum(r["valve"] for r in rows)/len(rows):.2f}% of runs ({sum(r["valve"] for r in rows)} of {len(rows)})')
        w = [r['final_year'] - r['start'] for r in rows]
        print(f'  final ship year minus start year: median {st.median(w)}, p10 {pct(w,.1)}, p90 {pct(w,.9)}')
        print(f'  runs with a new final ship: {100*fn/len(rows):.0f}%;  authored ships still waiting at run 10: '
              f'{st.mean(ch[9]["authored_left"] for ch in rows_by_chain):.2f} of 3, at run 50: '
              f'{st.mean(ch[min(49, len(ch)-1)]["authored_left"] for ch in rows_by_chain):.2f}')


if __name__ == '__main__':
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    chains = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    for policy in ('best', 'random', 'mix'):
        report(f'persistent arm, player "{policy}"', [chain(1000 + c, runs, policy) for c in range(chains)])
    report('fresh roll every run (old generator), player "mix"',
           [chain(5000 + c, runs, 'mix', persistent=False) for c in range(chains)])
