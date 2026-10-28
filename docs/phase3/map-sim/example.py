"""The worked example of 02-map.md section 3.14: run 1's arm and the update to run 2."""
from arm_sim import *

def ship(slot, kind, A, name, pods=None):
    s = {'slot': slot, 'layer': LAYER[slot], 'kind': kind, 'A': A, 'name': name, 'age': 0,
         'authored': False, 'late': False, 'born': 1}
    s['pods'] = pods if pods else pods_for(kind, LAYER[slot])
    return s

run1 = {0: ship(0,'first',2300,'ARES-VII'),
 1: ship(1,'light',2361,'PETREL'), 2: ship(2,'std',2352,'HALCYON'), 3: ship(3,'std',2352,'OSPREY'),
 4: ship(4,'light',2512,'HERON'), 5: ship(5,'std',2467,'KESTREL'), 6: ship(6,'ark',2365,'ALBATROSS'),
 7: ship(7,'std',2612,'CURLEW'), 8: ship(8,'light',2672,'LAPWING'), 9: ship(9,'std',2612,'GANNET'),
 10: ship(10,'std',2712,'PLOVER'), 11: ship(11,'ark',2625,'VESPER'), 12: ship(12,'light',2750,'SKYLARK'),
 13: ship(13,'light',2857,'SHEARWATER'), 14: ship(14,'std',2817,'KITTIWAKE'), 15: ship(15,'std',2817,'CORMORANT'),
 16: ship(16,'std',2927,'PROVIDENCE'), 17: ship(17,'ark',2830,'GOOD HOPE'), 18: ship(18,'light',2970,'WAYFARER'),
 19: ship(19,'final',0,'LAST LIGHT')}
set_final_year(run1)
print('run1 final', run1[19]['A'], 'bad', check(run1))
r = routes(run1); print('run1 routes', len(r), 'best', max(p for _,p in r))
route1 = [0,2,5,11,15,19]
run2 = {s: dict(run1[s]) for s in run1}
for s in route1 + [1, 13]:
    run2[s] = None
run2[0] = ship(0,'first',2301,'ARES-VIII')
run2[1] = ship(1,'light',2362,'BELLWETHER')
run2[2] = ship(2,'std',2353,'PATIENCE')
run2[5] = ship(5,'std',2468,'STEADFAST')
run2[11] = ship(11,'ark',0,'TIDINGS'); ark_year(random.Random(0), run2, 11); run2[11]['A'] = run2[11]['A']  # r may vary
run2[15] = ship(15,'std',2818,'FAR WIND')
run2[13] = ship(13,'light',2858,'MORNING STAR')
run2[19] = ship(19,'final',0,'LODESTAR')
set_final_year(run2, run1[19]['A'] + START_GAP)
for s in sorted(run2):
    x = run2[s]; print(s, x['name'], x['kind'], x['pods'], x['A'], mem_class(x))
print('bad', check(run2))
r = routes(run2)
best = max(p for _,p in r)
print('run2 routes', len(r), 'best', best)
by = {}
for rt,p in r:
    by[len(rt)] = max(by.get(len(rt),0), p)
print(by)
for rt,p in r:
    if p == best: print([run2[s]['name'] for s in rt], p)
# reachable from ARES-VIII
print('from first:', [(run2[t]['name'], D[(0,t)], run2[t]['A']-run2[0]['A']-D[(0,t)]) for t in POS if reach(run2,0,t)])
