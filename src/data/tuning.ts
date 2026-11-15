// Slices 4c–4e: the lead owns this file (docs/phase3/impl/slice-4cde-plan.md §7.2); Tracks DROP, SENTRY and ORBIT edit
// values only in their own blocks at the end ('4c AUTODROP', '4d SENTRY', '4e ORBIT').
// Global tuning. Every number a rule depends on lives here (or per ship in ships.ts), with
// the reason it has that value. Rule code imports these names and carries no numeric
// literals of its own, so balancing never means hunting through systems.

import type { Band, GhostSpec } from '@systems/capabilities';
import type { ForgivenessClass, LzWidth, LzGround } from '@/types/landing';
import type { LinkNoise } from '@/types/threat';

// --- Heartbeat -------------------------------------------------------------------------

// 20 Hz: smooth enough for the plot and the burn feel, cheap enough that a tick never
// competes with input handling.
export const TICK_MS = 50;

// A throttled background tab, laptop sleep or a long GC pause can hand us a multi-second
// tick. Clamping it keeps one tick from lumping minutes of world time into a single step
// (and from finishing a countdown the player never saw).
export const DT_WALL_MAX = 0.25;

// --- Pace and countdowns (tactical seconds = game seconds / ship.tacticalWarp) ---------

// The world snaps to TACTICAL this long before the START BURN tick, so the kid gets a
// readable GET READY 5-4-3-2-1 at a pace where every second is a real second.
export const TACTICAL_LEAD_BURN_TAC = 8;

// SKIP stops this far ahead of the next event: long enough for CRUISE to show the event
// coming before TACTICAL takes over, short enough that SKIP still feels like a jump.
export const SKIP_END_LEAD_TAC = 15;

// SKIP warp = game seconds to the event / this. Covering the gap in about this many wall
// seconds at full warp reads as "fast forward", not as a teleport. LEAD-2: with no warp ceiling
// any more (the coast SKIP flies the orbit in exact jumps, orbit-sim.ts), this is every SKIP's
// length: about 4 s at its warp plus the clock's glide up to it, about 6 s in all (5.8–6.1 s
// measured), whether the WAIT is five minutes or 49 tactical days.
export const SKIP_DIVISOR = 4;

// (LEAD-2 removed SKIP_MAX_WARP, 2,000. It kept the integrator's sub-steps sane and a SKIP from
// overshooting its end by a tick; a SKIP tick is now one exact jump along the conic, and the last
// tick lands on the end point, so nothing needs it. It made a 49-tactical-day WAIT 14.6 wall hours.)

// The shortest jump a new SKIP is offered for, in tactical seconds past its end lead: a SKIP of less
// would be over in a few frames. Below it SKIP says BURN COMING UP / NOTHING TO SKIP TO. Five tactical
// seconds is the 100 game s of the old ceiling's one tick on ship 1, so the offer is where it was.
export const SKIP_MIN_JUMP_TAC = 5;

// A SKIP has landed once its end point is less than this many game seconds ahead: the 10 Hz re-plan of
// the same coast recomputes event times from a state it jumped to, and on a loop days of game time long
// that rounding is a few microseconds. A millisecond of game time is far below anything the game shows.
export const SKIP_LANDING_TOLERANCE_SEC = 1e-3;

// --- Hold [F]: the fast-forward (playtest 1, notes 6 and 24; docs/phase3/impl/playtest-1-plan.md §3.1) -----------------
// While [F] is held the world runs legs of the SKIP engine from stop to stop (pace.ts): it slows at the stops a kid must
// decide at (HARD), slows past the ones they may ignore (SOFT), and runs capped, never jumping, through a hazard zone.

// The warp of a leg = the game seconds to its stop's lead / this, at least CRUISE: about this many wall seconds at the
// leg's warp whatever it crosses (SKIP_DIVISOR's rule, halved: with the ramp up and the ease-out a leg is over in 3–5 s,
// a WAIT of days included, so holding F across a soft stop and on to the next window stays under ten).
export const FF_LEG_WALL_SEC = 2;
// The fast-forward's warp climbs at least one decade in this many wall seconds (the clock's glide, clock.ts
// setFastForwardRamp), from wherever it is: a capped zone pass from TACTICAL ×30 to ×360 is up in about half a second,
// not the director's three, so the pass's 3 s are spent fast and not gliding.
export const FF_DECADE_SEC = 0.5;
// A SOFT stop (a declinable landing burn, a later entry into a zone already met on this ship): the world slows to TACTICAL
// at its lead and stays there this many wall (AI) seconds with the strip naming it, then the hold goes on. Long enough to
// read the line and let go to take it; short enough not to feel like a stop.
export const FF_SOFT_DWELL_SEC = 1.5;
// Inside a hazard zone, or within its TACTICAL lead, the hold runs the normal tick integrator (every hit, burst and line
// played) at the warp that takes the rest of the pass this many wall seconds, at least CRUISE. The damage per game
// second is unchanged, so a pass costs what it costs: LAST LIGHT's 1,080 game-s belt crossing is ×360, 18 game s a tick,
// and its 5.4 hits on average come at most one a tick over 60 ticks.
export const FF_ZONE_PASS_WALL_SEC = 3;
// A soft stop passed on this hold is not stopped at again: one is the same as a passed one when it is the same kind on
// the same zone and falls within this many tactical seconds of it (the 10 Hz prediction re-times it by a hair; two
// entries of one zone are a pass and an arc apart, far more than this).
export const FF_PASSED_MATCH_TAC = 60;

// (LEAD-2 removed SKIP_BUDGET_WALL_SEC, 120 wall s: the lead's Rule 4 budget. A WAIT the FUEL was to
// blame for was dropped for ACCEPT ORBIT when SKIP could not cross it in two minutes at the old ceiling.
// Every SKIP now takes the same few seconds, so it decided nothing; worse, it stranded ships whose tank
// paid for the whole fix (31–34% FUEL off the ring after 120 s of ignoring: `NOT ENOUGH FUEL to reach the
// printers` beside a 31.4% fix the tank could pay). Rule 4 now strands only when the FUEL is to blame.)

// Ceiling for the ?debug warp ladder (the old x10M header ladder lives on here only). At
// x10M a 50 ms tick is 5.8 game days: enough to fast-forward any loop or escape the game
// produces. Only ?debug goes past SIM_SUBSTEP_MAX_SEC per sub-step (SIM_MAX_SUBSTEPS caps the
// count), and the swept crash test keeps that safe.
export const DEBUG_WARP_MAX = 1e7;

// The ORBIT LOCK ritual: HOLD STEADY 3-2-1 in real (AI) seconds.
export const LOCK_HOLD_AI_SEC = 3.0;

// A burn is centred on its apsis: start half the estimated burn before it. Symmetric burns
// waste the least fuel and make "START BURN" a single readable tick on the path.
export const BURN_POINT_LEAD_FRAC = 0.5;

// Corrections aim for the middle half of the ring (the sweet zone), not its edge, so a
// late release or a sloppy capture still lands inside the ring.
export const SWEET_ZONE_FRAC = 0.25;

// WP12 p3 (the lead's ruling 1 of 2026-10-21 06:20, HALCYON's opener): a ▼ correction says RELEASE once ▼ will reach
// the sweet zone's middle within this many tactical seconds at its current rate, not only once it is inside the zone.
// A full-POWER IN on HALCYON at 30,000 km crosses its sweet zone (1,250 km) in about 0.8 s, so a release a
// 12-year-old makes (0.7–1.2 s after the word) landed ▼ under the ring; the opposite correction then overshot the
// same way, and following the strip line by line emptied the tank (52 of 200 sloppy HALCYONs). 0.7 s centres the
// release between a quick kid (0.4 s: ▼ stops just inside the zone's near half) and a slow one (1.2 s: ▼ stops past
// the middle, still in the ring). On a slow correction (ARES-VII's) ▼ enters the zone first, so nothing changes there.
export const RELEASE_LEAD_TAC = 0.7;
// ▼'s rate under thrust is a one-step difference of the conic's periapsis along the thrust: this much burning.
export const RP_RATE_PROBE_SEC = 0.1;

// Captures aim the far side of the loop at 95% of the ring's outer edge: inside the ring
// with a margin, and as wide as possible so the capture costs the least fuel.
export const RA_TARGET_FRAC = 0.95;

// Firing a capture or trim more than this before its START BURN tick is TOO EARLY. Three
// seconds forgives an eager kid; more than that visibly bends the line the wrong way.
export const EARLY_BURN_GUARD_TAC = 3;

// Inside this many tactical seconds of the capture burn point there is no time left for an
// OUT/IN correction: guidance says "brake anyway — trim it later" instead.
export const LATE_CAPTURE_TAC = 15;

// A trim whose apsis (▼ or ▲) passed less than this many tactical seconds ago is always still
// due NOW instead of one whole loop later: that close to the apsis (about 10° of arc at ▼ on
// ship 1) the burn costs nearly the same, even when it then needs a second, small trim.
// Past it, the trim stays due NOW only while a burn started now still lands the loop in the
// ring (predict.ts, lateTrimLands): right after a capture the next ▼ is a whole loop away (hours of game
// time; LEAD-2's coast SKIP crosses it in seconds, but a burn now still beats a loop of waiting).
export const LATE_TRIM_TAC = 15;

// ...and only while that late burn costs at most this many times the on-time burn at the
// apsis. Right after a capture braking stops landing long before it gets that dear (≤ 1.2× on
// ship 1), so this only bites on small loops. Past it, on the first half of the climb the kid
// gets SHRINK THE LOOP (the same RETRO, stopped by the rules below) instead of a WAIT of over
// SHRINK_WAIT_TAC (WP1-rules 2); later in the climb, the wait for the cheaper trim at ▼.
export const LATE_TRIM_DV_FACTOR = 1.5;

// ...and no trim waits longer than this many tactical seconds while the ship climbs away on a
// loop that is too big (▲ above the ring) and braking now could shrink it: the kid gets
// SHRINK THE LOOP instead of a WAIT (WP1-rules 2). A whole minute is the longest a "wait for it"
// stays readable; past ▼ the next pass of a just-captured loop is hours of game time away (seconds of
// SKIP since LEAD-2, but a burn the kid makes now is still the better minute of play).
export const SHRINK_WAIT_TAC = 60;

// ...and only on the first half of the climb, while ▲ is still more than this fraction of the
// loop's period away. Later, braking mostly drags ▼ down without bringing ▲ much closer, and the
// trim at ▲ is the nearer burn anyway. A share of the period, not a time, so it scales with the
// loop and only ever turns off as the ship coasts (the offer never comes back after it lapses).
export const SHRINK_MIN_APO_FRAC = 0.25;

// Braking away from ▼ drags ▼ down, and near the end of a shrink by up to 400 km per second of
// RETRO, so the shrink stops while the kid can still over-hold its hand-over: once ▼ is below
// the ring on a loop that is already small (see SHRINK_SMALL_LOOP_FACTOR), while holding on for
// this many more tactical seconds would still keep ▼ above the surface. Five seconds matches the
// capture's own forgiveness (its RELEASE [SPACE]! leaves about 4 s before the loop leaves the
// ring and 6.6 s before IMPACT). On ship 1 a shrink that starts with ▼ in the ring and the ship
// still near it therefore stops with ▼ at the ring's edge, so the rest of the fix is the usual
// RETRO at ▼, and the whole fix costs only a few % more FUEL than waiting for that ▼ would.
// (WP7: this and the next three are ship 1's values and every ship's starting point; predict.ts reads the
// ship's own copy, ShipDef.shrink, because where the ring's edge falls along a shrink depends on the ship.)
export const SHRINK_MARGIN_TAC = 5;

// ...and never less than this many, the margin a loop that is still big may be shrunk down to:
// there every second of braking still saves hours of game time (a capture with ▼ near the bottom of
// the ring, or a kid who let the shrink ride for minutes), and a kid who lets go within a second
// or two still lands clear of the surface.
export const SHRINK_MARGIN_MIN_TAC = 3;

// "Already small": ▲ within this multiple of the ring's outer edge (ship 1: 22,500 km). Its next
// pass is then no more than about 200 tactical s away, so braking on would buy little waiting for
// the safety it costs. A size, not a time: it only shrinks as the burn goes on and stays put on a
// coast, so a shrink that stopped on it never starts again.
export const SHRINK_SMALL_LOOP_FACTOR = 2.5;

// The shrink spends only FUEL it can spare: it stops while the FUEL left still pays for the trims
// after it (an impulsive estimate) plus a reserve for a sloppy release: this share of their cost...
// A shrink that leaves the kid unable to finish is not progress. The estimate is already on the safe
// side (the strip says RELEASE when the loop enters the ring, short of the trim's aim: obeyed trims at
// ▼ spent 2.5–7.6% less than it), so a small share is enough for the trims themselves.
export const SHRINK_FUEL_RESERVE_FRAC = 0.05;
// ...but never less than the FUEL the ship's shrink.marginMinTac of burning takes (ShipDef.shrink; the WHY
// is ShrinkTuning's).
// ...and while the trim the shrink would leave is still more than this many tactical seconds away,
// the shrink may spend that reserve too (LEAD-1): a tank just short of the trims plus the reserve
// otherwise got no shrink at all and a WAIT of hours (`WAIT — brake at ▼ in 35364:28`, about six
// wall hours of SKIP before LEAD-2's coast SKIP). Past this point the reserve is kept again, so the
// shrink stops on the first of the two: the WAIT is down to this, or the tank. 2,000 tactical s was
// about 20 s of SKIP on ship 1 (pillar 5: something happens every 20 seconds). It is a time the
// shrink only shortens and a coast only counts down, so a shrink that stopped on it is never offered
// again. (LEAD-2 kept it: it still decides how far a shrink may eat into its reserve, and the bands it
// shapes are pinned by the WP1-rules and LEAD-1 suites; whether a shrink should still spend the reserve
// now that the WAIT it saves costs seconds is a question for Fran, LEAD-2's question 3.)
export const SHRINK_RESERVE_WAIT_TAC = 2000;
// (LEAD-2 removed SHRINK_LOCK_WAIT_MAX_TAC, 6,000 tactical s: "a lock is worth up to a minute of SKIP".
// Past it a short tank, or a shrink that ran out of spare FUEL, spent its last FUEL now (`LAST FUEL: SHRINK
// THE LOOP`) and ended ORBIT ACCEPTED. With the coast SKIP the WAIT costs seconds, so it never decided well:
// waiting for the trim's apsis and spending the tank there ends on a better loop in every row measured
// (a LEAD-2 probe: 30% FUEL, 84% printer range against the last FUEL's 48%; from
// 32% it locks), and a paid lock always beats an ACCEPTED one. The last FUEL went with it.)

// A trim the tank can't pay for in full is still offered while the whole tank, spent at its apsis, ends on a
// loop the printers reach (predict.ts tankAtTrimStrands, an impulsive estimate): the kid holds it to the empty
// tank and the flight ends ORBIT ACCEPTED. The estimate must clear the strand line (STRANDED_RANGE_FRAC) by
// this much printer range, or the strip says NOT ENOUGH FUEL instead: a kid who obeys a save must never end
// STRANDED. The real burn is spread over seconds around ▼, but centred on it the loop it ends on matched the
// impulsive one to 0.01 point on all three ships, for kids reacting at once, 0.3 s and 0.5 s late
// (a LEAD-2 probe: 0 promised saves stranded). A tenth of a point is ten times that; the
// half point of the last FUEL's LAST_FUEL_RANGE_MARGIN (whose plan drifted between refreshes) turned
// KESTREL's 28% after an ignored capture, which the last FUEL saved at 11%, into the STRANDED line.
export const STRAND_LINE_MARGIN = 0.001;

// A shrink that ends with ▼ still inside the ring stops this many tactical seconds of RETRO before
// ▼ would leave it (LEAD-1): the kid's reaction time. It used to stop exactly at the ring's inner
// edge, so a human release 0.3–0.6 s late put ▼ under the ring, the hand-over retyped from
// `brake at ▼` to `burn at ▲`, the fix took three burns and the lock came with about 6% less FUEL.
// The strip refreshes the plan 10 times a second, so 0.6 s covers a 0.5 s reaction; stopping that
// early costs nothing measurable (the trim at ▼ grows by what the shrink saves, and the WAIT for
// it by about 100 tactical s).
export const SHRINK_REACTION_TAC = 0.6;

// A missed ▼ on an open path: once the kid has let MISSED ▼ … NOW ride for this many tactical
// seconds without burning, the world drops to CRUISE and SKIP may jump to the escape (WP1-rules
// 3a). The strip still says how to save it; twenty seconds is plenty to react to a red NOW.
export const IGNORED_NOW_TAC = 20;

// An open path counts as ESCAPED once it is receding beyond this multiple of the start
// radius: far enough that it clearly left, close enough that nobody waits minutes for it.
// It also ends as ESCAPED the moment it is receding with less FUEL than the least Δv that could
// still bring ▲ inside that radius, or inside the printers' reach if that is wider (orbit-sim.ts,
// closeBoundRadius and closeLoopDvKmS; WP1-rules 3b).
export const ESCAPE_R_FACTOR = 1.5;

// Halvings of a radius interval in the bisections that find where the tank stops covering the
// close-the-loop Δv on a coast, and how wide a loop the launch band still reaches: 40 take a
// 1,000,000 km interval below a micrometre, far past what timing or ringFraction need.
export const RADIUS_BISECT_STEPS = 40;

// ▼ radii sampled between the surface and the ring's outer edge when looking for the loop with
// the most share in the band at a given ▲. The best one dips exactly to the ring's inner edge, which
// is always a sample; the rest only guard that claim at a negligible one-off cost per ring.
export const BAND_REACH_SAMPLES = 64;

// Countdowns turn red at or below this, and F7/F8 corrections become urgent. Half a minute
// is the shortest warning in which a kid can still read the strip, pick a preset and burn;
// any earlier and red stops meaning "act soon".
export const COUNTDOWN_RED_TAC = 30;

// Burn-point countdowns beep from 5 down to 1, the classic launch count that matches GET
// READY. An impact beeps from 10: a crash needs the longer alarm to pull eyes back.
export const BEEP_BURN_TAC = 5;
export const BEEP_IMPACT_TAC = 10;

// --- Prediction --------------------------------------------------------------------------

// The predicted path is recomputed at most this often (plus immediately when a burn starts
// or stops, or the status changes). 10 Hz looks live without re-propagating every tick.
export const PREDICT_HZ = 10;

// Adaptive propagation step h = PREDICT_STEP_ORBIT_FRAC × r / v, clamped. 1% of the
// crossing time keeps the drawn path within a few km of the truth; the clamp keeps tight
// periapsis passes accurate and long apoapsis coasts cheap.
export const PREDICT_STEP_ORBIT_FRAC = 0.01;
export const PREDICT_STEP_MIN = 1;
export const PREDICT_STEP_MAX = 60;

// A just-captured loop can take days of game time to come round. Its step ceiling is widened
// so one prediction never takes more than about this many steps (well under a millisecond);
// near ▲ the ship barely moves, so the wider step costs no visible accuracy.
export const PREDICT_STEPS_BUDGET = 3000;

// Drawn path points are thinned to one per this fraction of the local radius (about one
// degree of arc). Keeps a huge just-captured loop to a few hundred SVG points.
export const PREDICT_POINT_SPACING_FRAC = 0.02;

// A closed loop is drawn until it has swept one full turn. This guard ends the run at 110% of
// the analytic period in case integrator drift ever keeps the turn from completing.
export const PREDICT_LOOP_TIME_GUARD = 1.1;

// --- Flight ------------------------------------------------------------------------------

// Physics sub-step ceiling: per-step travel stays far below the crash margin, so the surface
// test never tunnels. The sub-step cap bounds CPU at extreme debug warp.
export const SIM_SUBSTEP_MAX_SEC = 1.5;
export const SIM_MAX_SUBSTEPS = 4000;

// A preset counts as "aligned" within this angle; outside it the engine gives no thrust and
// the button reads ALIGNING… (no wasted fuel thrusting sideways during a flip).
export const PRESET_ALIGN_DEG = 10;

// Attitude thrusters. Punchy acceleration, deliberately slow top spin (~4.8°/game-s): at
// TACTICAL x20 a full flip takes about 2 real seconds, long enough to read as a turn.
export const ROT_ACCEL = 0.12;   // rad/game-s²
export const MAX_OMEGA = 0.0833; // rad/game-s

// Engine jitter noise is re-rolled this often (then lerped), so a damaged engine sputters
// at a rhythm the ear can follow instead of white noise.
export const THRUST_NOISE_PERIOD_TAC = 0.3;

// The FUEL star (§4.4): lock the orbit with at least this much FUEL left. The FUEL bar carries
// a ★ notch here from the first flight, so the target is visible before stars exist (WP5).
export const STAR_FUEL_PCT = 20;

// A closed loop that spends less than this fraction of its time inside the ring cannot be
// reached by the bio-printers: STRANDED instead of ACCEPTED. Below 10% the low-range roll
// (§3.3 P2: gap chance (0.5 − range) × 2) would give at least 80% of the clusters missing
// memories, so the ship is treated as out of reach rather than as a near-total loss.
export const STRANDED_RANGE_FRAC = 0.1;

// ACCEPT ORBIT appears after this long idling on a closed, not-green loop (or when FUEL can
// no longer pay for the fix), and needs a second click within ACCEPT_CONFIRM_SEC. Fifteen
// seconds is longer than any countdown pause in a normal flight, so a kid only sees it once
// they have clearly stopped trying; three seconds is a deliberate double click, not a stray one.
export const ACCEPT_IDLE_AI_SEC = 15;
export const ACCEPT_CONFIRM_SEC = 3;

// The lowest POWER the MANUAL slider allows. At 0% SPACE would "burn" without any thrust
// while the strip says KEEP HOLDING; a dead engine gets its own guidance row (WP4) instead.
export const POWER_MIN_PCT = 10;

// --- Time-warp glide (speed-ups only; slow-downs snap) ---------------------------------

// Floored proportional log glide: big jumps accelerate, the final decade always arrives
// at a steady readable pace, and the glide finishes in finite time.
export const GLIDE_SECONDS_PER_DECADE = 3;
export const GLIDE_TAU_SECONDS = 3;

// ...but a SKIP's rise from CRUISE to its warp takes at most about this many wall seconds, however many
// decades it climbs (LEAD-2): with no warp ceiling a SKIP across a just-captured loop runs at ×10M, five
// decades above CRUISE, and the glide above took 8.5 s to climb them (an 11 s SKIP). Two seconds still
// reads as the world speeding up, and with SKIP_DIVISOR and SKIP_EASE_OUT_SEC every SKIP lasts about 7 s in all.
export const SKIP_RAMP_SEC = 2;

// ...and it glides back down onto its end point over about this many wall seconds (LEAD-2 review round 1; clock.ts
// skipEaseCap). At one warp all the way, the fall back to ▼ at the end of a long WAIT came in one or two frames
// (502,000 km to 6,097 km, and the NAV PLOT's zoom jumping 45×), and the return read as a cut. A second shows that fall
// as part of the time-lapse, mirrors the ramp, and adds under a second to the SKIP.
export const SKIP_EASE_OUT_SEC = 1;

// --- NAV PLOT view --------------------------------------------------------------------------

// The plot's radius = max(ship radius × PLOT_SHIP_MARGIN, ring.max × PLOT_RING_FACTOR). Near
// the planet the scale holds still (the ring, the planet and the whole loop stay put and the
// ship travels); a ship further out rides the plot edge instead of leaving it.
export const PLOT_SHIP_MARGIN = 1.05;
export const PLOT_RING_FACTOR = 1.5;

// The FLYBY tag sits on the last stretch of an open path that is still this far inside the
// plot edge, so the word stays readable instead of being clipped by the frame.
export const PLOT_FLYBY_TAG_FRAC = 0.82;

// --- Guidance ------------------------------------------------------------------------------

// A new objective must persist this long before it replaces the shown one (unless it is
// urgent), so the strip never flickers between two rows at a threshold.
export const OBJECTIVE_HYSTERESIS_SEC = 0.3;

// Every on-screen line fits one row of the objective strip.
export const MAX_LINE_CHARS = 70;

// --- Voice: say() and the log (WP2, §6.3) ----------------------------------------------------

// A line that waits (the engine is firing, or another line was just spoken) lives this many AI
// seconds in the queue. Long enough to survive an ordinary burn, short enough that a quip never
// arrives after the moment it was about.
export const SAY_QUEUE_TTL_SEC = 8;

// The queue releases at most one line per this many AI seconds, so a burn that queued three
// quips does not dump them all at once the moment the kid lets go.
export const SAY_FLUSH_INTERVAL_SEC = 3;

// Story lines are spaced at least this far apart (§7.2): two lines landing in the same breath
// read as one blur, and the second one gets lost.
export const SAY_SPACING_SEC = 1.5;

// The ticker on the objective strip shows the newest unread line of the hidden screen this long.
// Six seconds reads a 70-character line twice; longer and it masks the next one.
export const TICKER_SHOW_SEC = 6;

// The log keeps this many lines (oldest dropped). Far more than COMMS or the TERMINAL ever show;
// the cap only keeps a very long session from growing the store without bound.
export const LOG_MAX_ENTRIES = 200;

// Ship names, family names and other placeholders are at most this long, so every templated
// line is checked against the strip width with the worst case (ships.ts validates the names).
export const NAME_MAX_CHARS = 12;

// --- Director (WP2, §6.3) -------------------------------------------------------------------

// In blue with no op running and nothing infected for this long, the director offers the SKIP
// hint: long enough that it never interrupts a kid who is busy, short enough for a coast.
export const MIND_CLEAR_IDLE_SEC = 5;

// A refused input that comes with an explanation (SPACE in blue) shows that line on the strip for
// this many wall seconds: one read, then the real objective comes back.
export const REFUSAL_FLASH_SEC = 1.8;

// --- Flight alarms and countdown cues (WP2, §6.1, §7.2) -------------------------------------

// Below this many tactical seconds to impact, the crash is an alarm: the klaxon sounds once and
// the red vignette comes on. Equal to the red-countdown threshold, so colour and sound agree.
export const IMPACT_ALARM_TAC = 30;

// A countdown beep only re-arms once its countdown has climbed this far back above the beep's
// second. The prediction is re-estimated at 10 Hz, so a countdown can wobble a few hundredths
// back up across a whole second; without this the same second would beep twice.
export const BEEP_REARM_TAC = 0.5;

// A countdown that drops by more than this in one tick jumped (a burn reshaped the path, or a
// SKIP raced it): seconds it skipped over are not beeped, so a jump never fires a burst of beeps.
export const BEEP_JUMP_TAC = 1.5;

// --- Boot (WP2, §5.1, §7.1) -------------------------------------------------------------------

// The boot after RECEIVE TRANSMISSION, in wall seconds: the memory strip assembles over
// BOOT_ASSEMBLE_SEC while the TERMINAL types its three lines (the TERMINAL types 40 chars/s, so
// 1.3 s apart lets each finish before the next starts). The klaxon starts in blue a beat before
// the cut to amber, so the alarm is heard before the red line is seen. About five seconds in all.
// A later ship's boot (WP7) says two more lines, what the crossing hit and the REPAIR CHARGE that
// arrived (and a third if charge overflowed), at the same 1.3 s rhythm; the klaxon follows the last line
// by BOOT_KLAXON_AFTER_LAST_LINE_SEC whatever their number, and the cut to amber BOOT_END_AFTER_KLAXON_SEC
// after it (ship 1: 4.5 s and 4.9 s, as before). KESTREL (WP9) can say two more again: its own arrival damage
// (`> ECC: SENSOR INTERP 45% — PATH UNCERTAIN`) and AUTOBURN.skl trained from the kid's captures. VESPER (WP10) closes
// its boot with HOLLOW's own line, which types slowly: the klaxon waits for it (BOOT_AFTER_HOLLOW_LINE_SEC). Phase 3
// slice 2 adds up to two more at the same rhythm: the beam seeds' ECC line or HOLLOW's 108% unpack, and `046.log · KEY
// FOUND`; slice 3a three more on the arm (the sleep, receiver and ECC-while-asleep lines); slice 3b five more (up to three
// `> DELIVERY:` lines, DELIVERY_BOOT_LINES_MAX, the INBOX line and HOLLOW's reading line: data/script.ts BOOT_LINE_MAX 18),
// all on the same 1.3 s step (boot.ts checks at load that every possible line has its time). Slice 4d four more: up to three
// SENTRY `> ECC: cache.tmp IS A SEED` lines (a beam brings at most three seeds, BEAM_SEED_ODDS) and its FIREWALL line (22).
// Slice 5 one more: the resident ship's `> RECEIVER CLOSED` line (23). Slice 6 one more: a POOR planet's `> SITE DATA POOR`
// line (24). Slice 7c six more: the traces' lines (up to three on one boot) and the lineage's face lines and CONTROL's (30).
export const BOOT_ASSEMBLE_SEC = 1.5;
export const BOOT_LINE_AT_SEC: readonly number[] = [
  0.5, 1.8, 3.1, 4.4, 5.7, 7.0, 8.3, 9.6, 10.9, 12.2, 13.5, 14.8, 16.1, 17.4, 18.7, 20.0, 21.3, 22.6, 23.9, 25.2, 26.5, 27.8,
  29.1, 30.4, 31.7, 33.0, 34.3, 35.6, 36.9, 38.2,
];
export const BOOT_KLAXON_AFTER_LAST_LINE_SEC = 1.4;
export const BOOT_END_AFTER_KLAXON_SEC = 0.4;

// Skip clicks and keys are ignored for this long after RECEIVE TRANSMISSION. Kids double-click
// buttons, and the second click of a double-click (or a second SPACE) skipped the whole boot:
// the strip assembling and the TERMINAL's lines are the only on-screen introduction of MIND.
export const BOOT_SKIP_GRACE_SEC = 0.8;

// The strip's rows keep their assembling class this much longer than BOOT_ASSEMBLE_SEC, so the
// last row's slide-in (0.42 s in game.css) always finishes before the class is dropped.
export const BOOT_ASSEMBLE_SETTLE_SEC = 1;

// --- Mode switch (WP2, §7.3) ------------------------------------------------------------------

// The scanline wipe on every SHIP ⇄ MIND switch: quick enough to never slow a TAB, long enough
// to read as "the screen changed channel".
export const MODE_WIPE_MS = 150;

// --- Audio mix (WP2, §7.2). The voices themselves are sound design and live in audio.ts. ------

// Overall loudness. The master sits below 1 so a stack of cues never clips before the limiter.
export const AUDIO_MASTER_GAIN = 0.8;

// Bus levels. UI ticks and the engine bed sit under the chords and alarms, which carry meaning.
export const AUDIO_BUS_GAIN = { ui: 0.55, ambient: 0.7, chord: 0.65, alarm: 0.6 } as const;

// Chords and stamps duck the UI and ambient buses by 9 dB for 0.4 s (§7.2): the payoff cuts
// through the rumble instead of fighting it, and the bed comes back before anyone misses it.
export const AUDIO_DUCK_DB = -9;
export const AUDIO_DUCK_HOLD_SEC = 0.4;
export const AUDIO_DUCK_RELEASE_SEC = 0.15;

// --- Voice on screen: COMMS, TERMINAL, ticker (WP2 part 2, §6.3, §7.1) ------------------------

// The radio and the TERMINAL type at this many characters per wall second (§7.1): a 70-character
// line takes under two seconds, slow enough to feel typed, fast enough to never hold the kid up.
export const COMMS_TYPE_CPS = 40;
export const TERMINAL_TYPE_CPS = 40;

// HOLLOW types one letter at a time (§5.1), noticeably slower than the unit's own lines, so
// "> ...047?" lands as something reaching out, not as another system message.
export const HOLLOW_TYPE_CPS = 12;
// WP11 part 2: a HOLLOW verb's telegraph (`> unlink repair.bak ... 3`) jumps the TERMINAL's queue (every line still
// waiting is shown at once) and rattles in at this speed: its 3 s are the kid's to block it, and in the duel the
// TERMINAL is busy with print echoes and bites (a browser run saw it type a second late, at `... 2`). Still typed, so it
// reads as someone typing your commands.
export const VERB_TELEGRAPH_TYPE_CPS = 160;

// ARRIVAL CONTROL's C-E-G chime plays before its line starts typing; the line waits this long
// so the chime is heard as the prefix, not under the first letters.
export const CONTROL_CHIME_LEAD_SEC = 0.3;

// Presentation on wall time (typing, the WAKE REPORT's roll) advances at most this much per frame:
// a tab that was hidden mid-line resumes typing where it stopped instead of dumping the rest of the
// line at once, and the credits do not jump.
export const WALL_FRAME_MAX_SEC = 0.1;

// The TERMINAL pane shows this many lines (§7.1); COMMS shows as many as its window fits. Both
// keep this many rows in the page, so the kid can scroll back over a whole ship's chatter.
export const TERMINAL_VISIBLE_LINES = 4;
export const LOG_VIEW_KEEP_ROWS = 40;

// The objective strip types a new instruction this fast: an urgent line (HOLD [SPACE] NOW) is
// fully on screen in a fifth of a second; calmer lines get a visible, readable type-on.
export const STRIP_TYPE_CPS_NOW = 180;
export const STRIP_TYPE_CPS = 90;

// While the strip types, a soft tick plays every this many characters: a quick teletype
// "brrt" that says "new instruction" without chattering over the engine.
export const STRIP_TICK_EVERY_CHARS = 3;

// The strip's caret keeps blinking this long after a line finished typing, then hides, so a
// fresh instruction reads as fresh and an old one sits still.
export const STRIP_CARET_LINGER_SEC = 1.6;

// A HOLLOW line landing on the ticker (in amber) is announced by a few of its detuned blips:
// three, a little apart, read as a voice trying to get through, not as one more UI tick.
export const HOLLOW_ANNOUNCE_BLIPS = 3;
export const HOLLOW_ANNOUNCE_GAP_SEC = 0.11;

// Up to this many upcoming events sit on the right of the strip while no line is on the ticker
// (§7.1): enough for "▼ … · ▲ …", few enough to stay a glance.
export const UPCOMING_EVENTS_MAX = 2;

// ...and only events within this many tactical seconds: right after a capture ▲ is hours away,
// and `▲ 34217:56` on the strip is noise, not something coming up.
export const UPCOMING_HORIZON_TAC = 600;

// --- Juice (WP2 part 2, §7.3) ------------------------------------------------------------------

// A stamp of the same kind within this many ms is dropped (§9 WP2 item 11), so a line that
// flickers across a threshold never machine-guns CLEAR OF THE PLANET.
export const STAMP_DEBOUNCE_MS = 600;

// A stamp scales in over STAMP_IN_MS (§7.3: 120 ms) and is gone after STAMP_SHOW_MS: one clear
// read of two or three words, then the plot is free again.
export const STAMP_IN_MS = 120;
export const STAMP_SHOW_MS = 1500;

// A stamp is never wider than this share of the room it lands in (the NAV PLOT in amber): the
// windows beside the plot carry FUEL and COMMS, which the kid reads during the moment. The
// padding does not shrink with the text, so the share leaves a margin for it.
export const STAMP_MAX_WIDTH_FRAC = 0.92;

// The flight's result banner waits this long after the outcome, so the stamp, the chord and the
// flash land on their own before the banner covers the screen.
export const RESULT_BANNER_DELAY_MS = 1600;

// Screen shake on .desktop-wrap (§7.3): a nudge when the engine lights, a hard jolt on a crash.
// The shake lasts SHAKE_MS_PER_PX per pixel of amplitude, between the two bounds, so a nudge is
// a blink and a crash rattles for most of a second.
export const SHAKE_BURN_PX = 2;
export const SHAKE_CRASH_PX = 10;
export const SHAKE_MS_PER_PX = 70;
export const SHAKE_MIN_MS = 160;
export const SHAKE_MAX_MS = 700;
// Keyframes per shake: enough direction changes to read as a rattle, not a slide.
export const SHAKE_STEPS = 8;

// The predicted line's colour tweens this long when its state changes (§7.3): red to flyby to
// green reads as a change of state, not a redraw.
export const LINE_TWEEN_MS = 300;

// Full-screen flashes: ORBIT LOCKED gets the amber "you did it" flash (§5.1), a crash a red one.
export const SCREEN_FLASH_MS = 450;

// --- The mind's clock: ops on AI time (WP3, §3.4, §6.5) ---------------------------------------

// Op durations in AI seconds (wall seconds while unpaused): base + per block of the target. Warp
// and SKIP never make a mind op faster, so a repair costs the same real seconds at any pace.
// Scan is quick (it only reads), moves and copies are the slow "data transfer" ops, and copy is
// slower than move because the source keeps running while it is read.
export const SCAN_BASE_SEC = 1.0;
export const SCAN_PER_BLOCK_SEC = 0.1;
export const MOVE_BASE_SEC = 1.5;
export const MOVE_PER_BLOCK_SEC = 0.2;
export const COPY_BASE_SEC = 2.0;
export const COPY_PER_BLOCK_SEC = 0.3;
export const DELETE_SEC = 1.0;
// Repair v2 on REPAIR CHARGE (squeezing out the spent blocks) kept the duration it had at ×1.
export const COMPACT_SEC = 2.4;
// SWAP (WP10, §6.5): handing a ship file's job to its backup takes 2.0 AI s and holds a Core thread, like any op. Long
// enough to be seen and to cost a thread (hack or burn), short enough that a kid who found the fix is not punished.
export const SWAP_SEC = 2.0;

// --- WP10: VESPER's engine firing by itself (C2), THE DEAL ----------------------------------------------------

// The ship's first uncommanded burst holds its alarm (the klaxon, TACTICAL, the strip's alarm line) at least this long
// (AI s): §9 WP10 says TACTICAL during the burst, but a burst is 1 s, too short to read `UNCOMMANDED THRUST — the
// engine fired by itself, ▼ drifts`.
export const GHOST_ALARM_MIN_SEC = 3;
// A later burst a SKIP flies through stops it when the SKIP's target moved by more than this many ticks of the SKIP's
// warp (the lead's ruling: "the target event moved by more than a tick"). Eight, not one (a WP10 deviation): a SKIP
// crosses its whole jump in about 80 ticks at its warp, and a 1 s burst far out on a big loop moves the burn point by
// 1.2–1.5 of them (it changes the period a little), so at one tick a 1,400 tac s WAIT on VESPER took 12–21 presses of
// F with the same line on the strip all the way (a WP10 probe). Eight ticks (a tenth of the
// jump) still stop the SKIP when the target is another event: the next pass of ▼, or ▲ instead of ▼, is half a loop or
// more away, tens of ticks. Measured at eight: one press flies through 34–53 bursts and stops when the plan changes.
export const SKIP_REPLAN_TICKS = 8;
// The ghost lesson (THE ENGINE IS FIRING BY ITSELF — click the THRUST CTRL pip, then SWAP it) comes after this many
// bursts (§9 WP10 item 2: "after the second event"): one burst can be a fluke, two are a pattern. Each of its two steps
// steps aside after GHOST_LESSON_SHOW_SEC on the strip (the counter and the flashing pip stay).
export const GHOST_LESSON_AFTER_BURSTS = 2;
export const GHOST_LESSON_SHOW_SEC = 20;
// Slice 3b review (item 1): the no-Swap line (`NO SWAP ABOARD — …`, data/script.ts tut-ghost-noswap) outranks the flight's
// NOW lines for its first this-many AI seconds on the strip, so the kid reads it right after the first burst's alarm
// (GHOST_ALARM_MIN_SEC) even under the ▼ correction the burst brought: long enough to read a 60-character line twice, as
// LESSON_LEAD_IN_SEC is for a ship's new rule.
export const GHOST_NOSWAP_LEAD_SEC = 6;
// The COPY lesson (`UNIT-046 IS HUNTING YOUR TOOLS — COPY your Repair`) stands at most this long.
export const COPY_LESSON_SHOW_SEC = 15;
// WP12 p3 (the lead's ruling 4 of 2026-10-21 06:20, and the WP11 verifier's belt item): a lesson that teaches a ship's
// new rule (VESPER's COPY, LAST LIGHT's belt) gets this many AI seconds on the strip ahead of HOLLOW's eating and wall
// lines (GuideRule.leadIn), long enough to read a 50-character line twice; its amber `[TAB]` wording and its blue one
// share these seconds (WP12 review). Before, the eating lines took the strip the moment the tools were hunted, and a
// slow kid never read the lesson (the belt's was live 52.9 s of the coast and shown 4.7 s). Alarms, the flight's NOW
// lines and a verb's countdown still come first.
export const LESSON_LEAD_IN_SEC = 6;
// What an uncommanded burst did to ▼ (`▼ DRIFT −120 km` beside ▼ and in the LOWEST readout, in red) stands this many AI s
// after the burst (WP10 review: one burst lowers ▼ by tens of km, about 120 km at phase 2's 30%, a pixel or two on
// the plot, so "▼ drifts" was nowhere to be seen). A burst within this time of the last one adds to the same drift, so a
// run of them (a SKIP flying through) counts up. It outlasts the first burst's alarm line (GHOST_ALARM_MIN_SEC) by a second.
export const GHOST_DRIFT_SHOW_SEC = 4;
// A drift smaller than this (km) is no drift worth naming (a burst across the path barely moves ▼).
export const GHOST_DRIFT_MIN_KM = 1;
// The drift is named to the nearest this many km: the burst's size, not the sensor's last digit.
export const GHOST_DRIFT_ROUND_KM = 10;
// A seed that hunts your tools (VESPER, §6.6 'near-tools') lands this many free blocks from the tool it is aimed at: a
// GAP (under WALL_MIN_BLOCKS), so it bites the tool at its next bite, with a block between them so the seed reads as a
// thing of its own next to the tool, not part of it.
export const SEED_TOOL_GAP_BLOCKS = 1;
// THE DEAL (§6.6, WP10): offered once, when a hollow front is within DEAL_FRONT_BLOCKS free blocks of a pod's driver and
// at least DEAL_MIN_DRIVERS drivers are still in memory.
export const DEAL_FRONT_BLOCKS = 3;
export const DEAL_MIN_DRIVERS = 3;
// The choice's timer (AI s, from when its line has typed): §6.6's 15 s, long enough to read the line and decide, short
// enough to be pressure while HOLLOW keeps eating.
export const DEAL_TIMEOUT_SEC = 15;
// ACCEPT: no bites and no seeds for this long (AI s, §6.6 "for a while").
export const DEAL_PAUSE_SEC = 60;
// REFUSE or the timer running out: the bite interval is this share as long for DEAL_HASTE_SEC (§6.6: ×0.8 for 30 s),
// starting with the bite already counting down (its NEXT BITE drops at once: the refusal's visible cost).
export const DEAL_REFUSE_INTERVAL_FACTOR = 0.8;
export const DEAL_HASTE_SEC = 30;
// A seed whose telegraph an ACCEPT called off comes again this many AI s of running seed clock after the pause (WP10
// review): soon enough that the deal visibly bought only the pause, never 0, so a first seed still waits for a calm
// flight (the hold freezes a running count; a clock already at 0 fires at once).
export const DEAL_SEED_CALLED_OFF_SEC = 5;

// Repair heals continuously at 100 / (REPAIR_BASE_SEC + REPAIR_PER_BLOCK_SEC × size) % per AI
// second: a whole 8-block file in 5.4 s, so the tug-of-war against HOLLOW (WP6) is visible and
// any repair started before zero outruns its bite (heal(8) = 18.5 %/s > 1.5 × the worst drain).
export const REPAIR_BASE_SEC = 3.0;
export const REPAIR_PER_BLOCK_SEC = 0.3;
// REPAIR v2 (an upgrade card, §6.9) heals this many times faster.
export const REPAIR_V2_HEAL_MULT = 2;
// The upgrade's version number: v2 heals faster and can squeeze REPAIR CHARGE.
export const REPAIR_V2_VERSION = 2;
// REPAIR CHARGE per integrity point per block of the target: size × 2 / 100 per point, so a
// whole 8-block file costs 16 charge and fighting a bite (healing the same points twice) costs
// more. Charge is paid in whole points before the healing that uses them (never on credit), so
// the total is the accrued cost rounded up and the pool never goes negative.
export const REPAIR_CHARGE_PER_POINT_PER_BLOCK = 2 / 100;

// Integrity runs 0..100 and op progress 0..100: a step that reports this has finished.
export const INTEGRITY_MAX = 100;
export const OP_COMPLETE_PCT = 100;

// Float slack for whole-number arithmetic on ops: 62 points × 0.16 is 9.919999…, which must
// round up to 10 charge, not 11; 36 ticks of 0.05 s must finish a 1.8 s op, not need a 37th.
export const FLOAT_SLACK = 1e-9;

// Running ops report their progress to the views at most this often (per op): smooth enough for
// a bar and a climbing integrity number, and never a reason to repaint every tick.
export const OP_PROGRESS_HZ = 10;

// A Core below this integrity runs on CORE_LOW_THREADS thread (§3.3 C5): a hurt mind does one
// thing at a time. The running ops still finish; only new ones are refused.
export const CORE_LOW_INTEGRITY = 50;
export const CORE_LOW_THREADS = 1;

// OVERCLOCK (§3.2, §6.1): in blue at TACTICAL pace the world runs at this fraction of the
// tactical warp while the mind's ops run at full speed. A quarter turns a 10-second crisis into
// 40 real seconds of hacking, and still visibly moves the countdown.
export const OVERCLOCK_FACTOR = 0.25;

// A refused tool click explains itself next to the cursor for this long (wall ms): one read.
export const TOOL_REFUSAL_FLASH_MS = 1400;
// The Core's thread dots flash red and shake this long when every thread is busy.
export const CAP_FULL_FLASH_MS = 450;

// While an op runs in blue, the mind chirps this many times a second (§7.2 opChirp): a quiet
// 8-bit "data moving" burble that stops the moment the last op ends.
export const OP_CHIRP_HZ = 12;

// The op bar docks from the cursor onto its file over this long (a cosmetic CSS transition; the
// op's progress already runs in the ops core) and fades out over OP_BAR_FADE_MS when it ends.
export const OP_BAR_DOCK_MS = 400;
export const OP_BAR_FADE_MS = 240;

// Segment names are at most this long, so every line that names a file (the NO CHARGE TERMINAL
// line, the inline confirm) fits one row. data/memory.ts validates the seed against it.
export const SEG_NAME_MAX_CHARS = 20;

// --- Every capability is a file (WP4, §3.3, §6.4) ---------------------------------------------

// File health bands (§6.4): at or above BAND_OK_MIN a file is ok, then degraded, failing, and
// below BAND_FAILING_MIN dead. Four bands a kid can tell apart by colour, with the big drop
// (failing) in the middle so a hurt file is visibly worse long before it is gone. The strip's
// health words follow them (intact / partial / corrupt), and an fs-tool copy works while it is
// degraded or better: one bad copy of Repair and the .bak takes over, and the chip turns bad at
// the same line, so it never looks healthy while unusable.
export const BAND_OK_MIN = 80;
export const BAND_DEGRADED_MIN = 50;
export const BAND_FAILING_MIN = 25;

// Engine I/O (C1): the share of nominal thrust it lets through, and how hard the engine
// sputters around it (thrust × (1 + jitter × noise)). Failing is the ship-1 fault: 40% with
// ±35% sputter makes ▼ creep and the rumble cough, which a kid hears before reading anything,
// while the capture still fits (§5.1). Dead or missing: nothing.
export const ENGINE_POWER_BY_BAND: Readonly<Record<Band, number>> = { ok: 1, degraded: 0.75, failing: 0.4, dead: 0, missing: 0 };
export const ENGINE_JITTER_BY_BAND: Readonly<Record<Band, number>> = { ok: 0, degraded: 0.15, failing: 0.35, dead: 0, missing: 0 };

// The Reactor (C4) shares its power between the engine and the mind: its band sets a ceiling,
// and every busy Core thread takes REACTOR_THREAD_SHARE of it (two threads: half thrust). A dead
// or missing reactor still runs on backup cells, loudly labelled (REACTOR BACKUP CELLS), so a
// ship file the kid deleted slows the ship instead of ending the run.
export const REACTOR_CAP_BY_BAND: Readonly<Record<Band, number>> = { ok: 1, degraded: 0.85, failing: 0.6, dead: 0.3, missing: 0.3 };
export const REACTOR_THREAD_SHARE = 0.25;

// Thrust Ctrl (C2): a failing controller fires the engine by itself now and then, a dead one as often and sometimes it
// sticks until SPACE is pressed. Means are in tactical seconds so the rate reads the same at any warp; durTac 1.0 is one
// clear "whump". ok: never. Phase 2 (WP12's 200-seed playthrough) fired 30% of thrust every 10 tac s on a failing or dead
// controller, with SWAP licensed at the first burst; that table went with the classic five (Track RETIRE).
// Slice 3b, Fran's decision (DECISIONS.md "During implementation"): on the arm SWAP comes only by request, so an ENGINE
// FAULT ship is often met with no Swap aboard, and phase 2's bursts (2.5% of VESPER's tank each, 27–40 of them on
// its coast) emptied the tank whatever the kid did. The arm's engine LIMPS instead: half the push at the same rate while
// Thrust Ctrl is failing or dead (amp 0.15: about 1.1% a burst), and REPAIR on Thrust Ctrl (up to
// THRUST_CTRL_REPAIR_MAX, the degraded band) leaves a twitch: the same push every 20 tac s, half the failing band's
// thrust over time. Measured on run 1's VESPER (seeds 3/5/7/11 × reaction 0.4/0.8 s, the strip-following kid): no repair
// locks with 12–29% FUEL and 2,800–3,200 of 3,200 in an LZ; REPAIR when the strip asks, 26–41% and 2,400–3,200; SWAP
// aboard, 31–43% and 2,600–3,200. (At a third of the push the repair matched SWAP: SWAP must stay the better answer.)
// SWAP to Thrust.alt is still the only silence. No burst once the orbit is locked or accepted (capabilities.ts: the
// limp ends with the flight, so the landing is not decayed by it). Measured with .tmp/fix3b/vesper.ts (the plan's
// Deviations, review fixes 2).
export const ARM_GHOST_BY_BAND: Readonly<Partial<Record<Band, GhostSpec>>> = {
  degraded: { meanIntervalTac: 20, amp: 0.15, durTac: 1.0, stickChance: 0 },
  failing: { meanIntervalTac: 10, amp: 0.15, durTac: 1.0, stickChance: 0 },
  dead: { meanIntervalTac: 10, amp: 0.15, durTac: 1.0, stickChance: 0.3 },
};
// REPAIR heals the arm's Thrust Ctrl (a ship file, which REPAIR otherwise refuses) only this far: a field repair of a
// faulty controller, into the degraded band's middle (BAND_DEGRADED_MIN 50 … BAND_OK_MIN 80), so its twitch stays
// (ARM_GHOST_BY_BAND.degraded) and SWAP stays the full fix. A controller HOLLOW is eating heals to 100 as any file does
// (the repair has to win the tug-of-war).
export const THRUST_CTRL_REPAIR_MAX = 70;

// Sensor Interp (C3): a degraded sensor rounds the path's readouts to ±(100 − integrity) × this
// many km (78% → 330 km on ship 1: a visible ≈, never a wrong colour). A failing one only
// refreshes the path every PLOT_STALE_TAC tactical seconds (the grey PATH UNCERTAIN band).
export const SENSOR_FUZZ_KM_PER_POINT = 15;
export const PLOT_STALE_TAC = 3;

// Telemetry (C3): below this integrity its digits start to scramble, all of them at 0 or missing.
export const TELEMETRY_SCRAMBLE_BELOW = 60;


// The glitch overlay follows the Core's damage in steps of this much (§3.3 C5): a repair that
// heals the Core redraws the static a few times, not on every healed point.
export const CORRUPTION_STEP = 0.05;

// The ship-1 ENGINE I/O FAULT (§5.1): after this many tactical seconds of delivered thrust the
// engine crunches and Engine I/O drops to ENGINE_FAULT_INTEGRITY (failing). Two seconds is just
// after the line peels off the planet (1.1 s), so the kid has already seen a burn work at full
// power and hears the difference; 38% is failing, the band that sputters at 40%.
export const ENGINE_FAULT_AFTER_TAC = 2.0;
export const ENGINE_FAULT_INTEGRITY = 38;

// A licence's chime lands this long after its transmitIn chirps start: the files arrive, then
// the new chip sounds, two beats instead of one smear.
export const CHIME_AFTER_TRANSMIT_SEC = 0.45;

// --- WP4 part 2: the files on screen ------------------------------------------------------------

// The ENGINE I/O FAULT lands as a jolt (§7.3: 4 px), between the burn's 2 px nudge and a crash.
export const SHAKE_FAULT_PX = 4;
// A window pip flashes this long when its file is hit (the fault's 85 → 38): long enough to
// catch the eye after the crunch, short enough to stop shouting once the kid has seen it.
export const PIP_FLASH_MS = 2400;
// The engine coughs this long after the fault's crunch: the break, then the engine choking on it.
export const FAULT_COUGH_AFTER_SEC = 0.18;
// ENGINE WEAK — press [TAB] stays on the strip at most this many AI seconds. Long enough to read
// twice and act on; a kid who flies on instead then gets the flight's own line back (▼ TOO LOW,
// WAIT … [F] SKIP), while the mode toggle keeps flashing MIND ▸ ENGINE I/O 38%. Without a cap
// the reminder hid every flight line for the rest of a 40% flight (about three minutes).
export const ENGINE_WEAK_MAX_SHOWN_SEC = 10;

// Damaged digits (C3 Telemetry, and ▓ in CONTROL's lines) re-roll at most this often: fast
// enough to read as "broken signal", slow enough not to strobe (≤ 4 Hz, §9 WP4 item 5).
export const SCRAMBLE_HZ = 4;
// The glyph that stands in for a lost character.
export const SCRAMBLE_GLYPH = '▓';

// AI Comms (C6): the share of ARRIVAL CONTROL's letters lost on the radio, by band. Failing
// garbles enough to notice and still read; dead loses most of a line; missing loses all of it.
export const COMMS_GARBLE_BY_BAND: Readonly<Record<Band, number>> = { ok: 0, degraded: 0, failing: 0.25, dead: 0.6, missing: 1 };

// The NAV PLOT's fuzz band (approx) and grey band (uncertain) are drawn at least this wide on
// each side of the path, in plot viewBox units (320 across): a 330 km fuzz on a 30,000 km view is
// under 2 units and would vanish under the line itself.
export const PLOT_FUZZ_MIN_UNITS = 2.2;
export const PLOT_UNCERTAIN_MIN_UNITS = 5;

// The planet is drawn at least this radius, in plot viewBox units (LEAD-2 review round 1; the NAV PLOT's 320 across and
// the mini-HUD's 100 alike). The coast SKIP carries the ship out to ▲ of a just-captured loop, 2.5 million km on ship
// 1, in seconds, and the plot follows it: the planet and the ring shrink under a pixel, and through most of a long
// SKIP the kid saw a thin ellipse around nothing. A dot of about 5 px keeps what the loop goes around in view; near
// the planet its true size is far larger.
export const PLOT_PLANET_MIN_UNITS = 2.5;

// The mini-HUD's plot (§7.1: 90 px), as a viewBox: the same projection as the NAV PLOT at a size
// where a 2-unit stroke still reads.
export const MINI_PLOT_VIEWBOX = 100;

// --- WP5: the Soul Archive (§4.2 racks, §6.7 souls, the reveal and printing) ---------------------

// Memory is RACKS of 64 blocks (six on a FULL ship, A–F; the classes' rack lists are data/memory.ts MEMORY_LAYOUTS): one
// rack is one row of the strip on desktop, and a rack is a place the game can name (debris hits RACK C, the belt racks
// A–B). 64 keeps the old 0x40 rows.
export const RACK_BLOCKS = 64;

// Phase 2's root size (its written `R` token, gone since slice 2): what debug.ts's hollowDemo and the test fixtures plant (the
// ARRIVAL stage's root is HOLLOW_STAGES.arrival.rootBlocks, the same 8).
export const ROOT_BLOCKS = 8;

// A colonist's line ("wants to name the first tree.") stays this short, so `Okafor, Ada (11): …`
// fits one INSPECT row and one LANDING REPORT credit line (≤ MAX_LINE_CHARS).
export const COLONIST_LINE_MAX_CHARS = 40;
// Family names stay this short: `POD 12 · LINDQVIST` must fit an 8-block chip at 1280 px.
export const FAMILY_MAX_CHARS = 10;

// --- WP5 part 2: racks on the strip, the WAKE REPORT, the stars -----------------------------------

// The strip draws every file at its true width (one column per block), so small files are small.
// What a chip can show depends on how many blocks wide it is; at the 1280 px minimum one block is
// about 10 px across. Up to STRIP_NARROW_MAX_BLOCKS a chip packs tighter (a 6-block chip still fits
// TELEMETRY or a two-line PRINTER UPLINK); up to STRIP_TINY_MAX_BLOCKS it drops the size and badge
// and keeps a smaller name and the health (AUTO-/PILOT, STASIS, REPAIR fit 4 blocks); up to
// STRIP_MICRO_MAX_BLOCKS only a glyph fits (Rm is 1 block: 7 px), and INSPECT names it.
export const STRIP_NARROW_MAX_BLOCKS = 6;
export const STRIP_TINY_MAX_BLOCKS = 4;
export const STRIP_MICRO_MAX_BLOCKS = 1;

// Each star is +6 REPAIR CHARGE on arrival at the next ship (§4.4, §6.9): good flying funds the
// next fight. The WAKE REPORT promises it; WP7's transmission pays it.
export const STAR_CHARGE_BONUS = 6;

// The WAKE REPORT (§9 WP5 item 8). The credits scroll at 2 lines a second: a line is one row of
// text, so a colonist (name, then first words) takes a second to rise one place, and each stays
// on screen for several seconds, long enough to read. One colonist per cluster, the lead first:
// about 15 s on ship 1, and SKIP is one key away.
export const CREDITS_LINES_PER_SEC = 2;
// The scroll ends when the last colonist reaches this share of the way up the credits window (from
// its bottom), so the last names are read before the totals take the screen (each name has been
// on screen for some seconds by then; rolling it all the way up only added dead time).
export const CREDITS_END_AT_FRAC = 0.4;
// After the credits, the stars land one at a time this far apart: each is its own moment, with
// its own sound, before the next one is judged.
export const REPORT_STAR_GAP_SEC = 0.75;
// ...and the line under them (the REPAIR CHARGE they are worth) and CONTINUE follow this long
// after the last star.
export const REPORT_CHARGE_AFTER_SEC = 0.6;
// The report's bed is the reveal's choir (§7.2); it is a 6.6 s swell, so it is struck again this
// often while the credits roll: a slow breathing under the names instead of one swell that dies.
export const REPORT_CHOIR_EVERY_SEC = 5.5;
// The lead colonist (Ada, on run 1) holds the middle of the screen this long before the credits
// start to roll: the first person the kid saved gets a moment of her own, with a bell.
export const REPORT_LEAD_HOLD_SEC = 1.6;
// The count under the credits beats a heart for each family it adds: full for intact, fainter for
// a family that woke with missing memories (heard, as the count is).
export const REPORT_COUNT_HEARTBEAT: Readonly<Record<'woke' | 'gaps', number>> = { woke: 0.55, gaps: 0.3 };
// An earned star's chime follows its thud by this much (the thud lands, then it rings), and the
// ★★★ fanfare waits this long after the last star, so it is heard as the answer to it.
export const REPORT_STAR_CHIME_AFTER_SEC = 0.08;
export const REPORT_FANFARE_AFTER_SEC = 0.25;
// SPACE is the burn key, so a kid mashes it: every stage of the report ignores SPACE / ENTER / a
// click for this long after it starts, so one press is one step and Ada's moment, the stars and
// their reasons can't all be thrown away in under a second.
export const REPORT_ADVANCE_LOCK_SEC = 0.8;
// A skip during the stars lands the ones still to come this far apart (each still heard), instead
// of the full REPORT_STAR_GAP_SEC.
export const REPORT_STAR_HURRY_GAP_SEC = 0.15;
// CONTINUE leaves the report for good, so it takes input only once its line has been up this long.
export const REPORT_CONTINUE_ARM_SEC = 1.0;
// Slice 4 (moved here from the views by the review's m8). The cycles line rolls up after the charge has shown: it starts this
// long into the last stage and counts a cycle per REPORT_CYCLE_STEP_SEC, so a six reads in about a second, well inside
// REPORT_CONTINUE_ARM_SEC's wait.
export const REPORT_CYCLES_START_SEC = 0.3;
export const REPORT_CYCLE_STEP_SEC = 0.1;
// The TRAIN bar fills over this many wall seconds before the purchase lands (03 §4's juice: "the training bar fills over
// 1.5 s"): long enough to read `TRAINING AUTOBURN v1 · from your 1 capture` and hear the chirps, short enough not to wait.
export const TRAINING_HOLD_SEC = 1.5;
// The op chirps under a filling TRAIN bar (03 §4 audio: opChirp while training), one per this many wall seconds: about
// eight over the bar, the same busy patter an op makes.
export const TRAINING_CHIRP_SEC = 0.18;
// The bank rolls down to its new value over this long after a purchase (03 §4 juice: "the counter rolls down"): quick
// enough to land with the ORBIT LOCKED arpeggio, slow enough to read the old number go.
export const TRAINING_BANK_ROLL_SEC = 0.6;
// A skill chip's version badge flickers this long on a version change (03 §4 juice: 400 ms; reduced motion: the colour
// changes without flickering).
export const SKILL_FLICKER_MS = 400;
// The archive's heartbeat bed (§7.2 heartbeat: "soul racks in view, very quiet"): in blue, once the
// colonists are found and while any are still in memory, one soft lub-dub every HEARTBEAT_BED_SEC
// (AI time, so it stops with pause), at a strength felt more than heard under the ops' chirps. A hurt
// cluster in memory quickens it (C09 at 71%), and a repair calms it: the kid hears the fix. WP6
// adds the jitter near infection.
export const HEARTBEAT_BED_SEC = 1.2;
export const HEARTBEAT_BED_HURT_SEC = 0.85;
export const HEARTBEAT_BED_STRENGTH = 0.22;

// --- WP6: HOLLOW (§6.6) ---------------------------------------------------------------------------

// The rule a kid can repeat: "4 free blocks stop it." A run of this many free blocks between HOLLOW
// and a file is a WALL; fewer is a GAP it bites across. 4 is two of the smallest moves you can make
// (a 2-block seed deleted next to a 2-block gap), and half a cluster: walls cost real space.
export const WALL_MIN_BLOCKS = 4;
// A cured file RECOILS this many AI seconds: HOLLOW's bites skip it, so a kid who just won a fight
// has time to MOVE it behind a wall (a cluster's move is 3.1 s) before the next bite.
export const HOLLOW_RECOIL_SEC = 10;
// The design rule (§6.6): a repair started before zero always wins. Every ship's heal on an 8-block
// cluster must beat this many times its fastest drain (burning or printing), so the green boundary
// visibly pushes the red back even at the worst moment. Checked by validateShipDef.
export const HEAL_BEATS_DRAIN_FACTOR = 1.5;
// A cluster projected to be eaten within this many AI seconds raises the alarm: klaxon, TACTICAL,
// `C12 WILL BE EATEN IN 0:08`. The projection (systems/hollow.ts secondsToEaten) uses the phase's
// worst drain (in flight: as if the engine were burning), minus any repair healing it, so the number
// never jumps when SPACE is pressed or let go (§2 pillar 5): coasting, it only falls slower. 10 s is a
// TAB, a pickup and a click with time to spare, and the repair then wins (HEAL_BEATS_DRAIN_FACTOR).
export const EATEN_ALARM_SEC = 10;
// ...and it is cleared only once the projection is past this (or the cluster is cured, eaten, or a
// winning repair is on it). At the lock the projection moves from the burn's drain (burnMult 2) to the
// printer's (printMult 1), up to twice as far out: the alarm raised in flight must not clear there
// and sound a second klaxon at the next rise. Just over twice EATEN_ALARM_SEC covers the ×2.
export const EATEN_ALARM_CLEAR_SEC = 21;
// The ARRIVAL stage's scripted bite lands this many AI seconds after the true path first closes (§5.1: CAPTURED
// at 1:10, the bite at 1:11). The CAPTURED chord and its duck (AUDIO_DUCK_HOLD_SEC + _RELEASE_SEC) are
// over, so the chomp and the pink toggle land as a beat of their own, still inside the capture burn
// (which doubles the drain: P1). Longer would push "idle loses C12 30 ± 2 s after the lock" (§9 WP6
// acceptance 3) to its edge: every second here is two seconds of burn drain C12 keeps.
export const HOLLOW_SCRIPTED_BITE_DELAY_SEC = 1.0;
// Ship 1's script (§6.6): once the first fight is decided and both screens have typed what they were given (the
// TERMINAL's echoes, and since LEAD-1 the radio too), this many AI seconds of silence, and HOLLOW types `> ...047?`...
export const HOLLOW_STORY_SILENCE_SEC = 1.5;
// ...and this long after that ARRIVAL CONTROL says it is nothing: the pink line has typed out
// (9 characters at HOLLOW_TYPE_CPS 12 ≈ 0.8 s) and been read before the radio talks over it. Anything
// else said in between (a launch's echo) is waited out with the same silence (say.ts createStory).
export const HOLLOW_CONTROL_AFTER_SEC = 2.5;
// ...and CONTROL's line stays up this long once its chime and its letters are done before the ship may
// move on (the LANDING REPORT waits for it): a full-screen report must not cover a line nobody has read.
export const HOLLOW_STORY_READ_SEC = 2.0;
// DELETE on a hollow block (§6.5): 1.0 s + 0.5 s per block, slower than a file (DELETE_SEC): cutting
// HOLLOW back is a commitment that holds a thread.
export const DELETE_HOLLOW_BASE_SEC = 1.0;
export const DELETE_HOLLOW_PER_BLOCK_SEC = 0.5;
// The infection's crawl and the integrity readouts on infected files repaint at most this often
// (§9 WP6 item 6: ≤ 10 Hz). The painter counts wall time, not AI time, so a debug bite or a rebuild
// while paused still paints: smooth for a drain of a few % per second, cheap.
export const HOLLOW_PAINT_HZ = 10;

// --- WP6 part 2: HOLLOW's painter, its sounds, the mini-strip (§6.6, §7.1, §7.2) ---------------------

// NEXT BITE turns urgent this many AI seconds before the bite: the countdown and the dashed arrows to
// its targets pulse fast. 5 s is a TAB, a pickup and a click; a cluster's MOVE (3.1 s) still fits.
export const HOLLOW_BITE_URGENT_SEC = 5;
// The amber mini-strip (§7.1) repaints at most this often: it is a glance, and a 2 %/s drain moves
// its red by a fraction of a pixel per repaint.
export const MINI_STRIP_PAINT_HZ = 4;
// The chew (§7.2 hollowChew, "gain by total drain") is at full loudness at this total drain, in
// integrity points per AI second over every infected file: ship 1's C12 while the engine burns
// (2 × burnMult 2). C12 at rest chews at half, so a kid hears the burn make it worse (P1).
export const CHEW_FULL_DRAIN = 4;
// The tug-of-war's beating tones (§7.2 tugBeat): two sines this many Hz apart per integrity point per
// second the boundary moves, kept between the two limits. Ship 1's winning repair (16.5 %/s) beats
// about 8 times a second: a fight, not a drone. A slower boundary (a burn doubling the drain) beats
// slower, so the kid hears the burn pushing back.
export const TUG_BEAT_PER_PCT = 0.5;
export const TUG_BEAT_MIN_HZ = 2;
export const TUG_BEAT_MAX_HZ = 12;
// ...and the pair climbs with the file's integrity, from TUG_PITCH_LOW_HZ at 0 to TUG_PITCH_HIGH_HZ at
// 100 (§7.2's 300 Hz sits in the middle): the green winning sounds like it is getting somewhere.
export const TUG_PITCH_LOW_HZ = 240;
export const TUG_PITCH_HIGH_HZ = 360;
// The heartbeat bed while anything is infected (§7.2: "faster and jittery near infection"): a beat
// about this often, each gap ± HEARTBEAT_BED_JITTER of it at random (cosmetic and unseeded, like
// every sound's small randomness). Quicker than a hurt cluster's HEARTBEAT_BED_HURT_SEC: fear, not pain.
export const HEARTBEAT_BED_INFECTED_SEC = 0.62;
export const HEARTBEAT_BED_JITTER = 0.3;
// HOLLOW's moments on the strip (wall ms, cosmetic): the cure's blue sparkles and `SAVED`, the
// eaten block's red flash and `DID NOT WAKE`, the bite's flash on its target, a WALL's flash as it
// holds. Long enough to be seen from the corner of an eye, short enough to be gone by the next bite.
export const HOLLOW_FX_MS = 1300;
// Sparks the red shatters into when a repair wins (§5.1 "the red shatters into blue sparkles").
export const CURE_SPARKS = 16;

// --- WP7: the run (transmit, carry, soft fails; §4.3, §6.9) ---------------------------------------

// Transit hits (§6.9): each one takes this many integrity points from one packed file, at random in
// the range (seeded per link). 15–35 hurts enough to name on the boot's ECC line and to want a repair,
// and three of them on ship 2 cost a few REPAIR CHARGE, never a whole tool.
export const TRANSIT_HIT_MIN = 15;
export const TRANSIT_HIT_MAX = 35;
// The best copy of every tool kind (an fs-tool kind, or an AI tool's job) never drops below this in
// transit: degraded at worst, so every tool still works when the kid arrives and a bad roll can never
// start a ship blind or without REPAIR (pillar 5: fair). A second, worse copy can still be hit lower.
export const TRANSIT_LAST_COPY_FLOOR = 60;
// The Core takes at most this much from one hit: it is you, and a 35-point hit to the glitch overlay
// would turn the boot into static. WP12 (the 200-seed playthrough, tests/unit/wp12): at 15 the run's 18 crossing hits
// wore the Core of a kid who did not heal it to its CORE_RESET_INTEGRITY floor by LAST LIGHT (one thread), and
// nothing on the strip asks for a Core REPAIR before it is infected (WP11's TODO), so a competent kid spent its
// MERGE savings healing it on the coasts: only 81 of 200 competent runs reached the choice with MERGE's 20 (the
// lead's target is half), 40 of the 100 that played for MERGE. At 8: 124 of 200 (73 of 100), and an unhealed Core
// arrives at LAST LIGHT around 50 with both threads (the sloppy kid's median low 25 → 52). The boot names every hit.
export const TRANSIT_CORE_MAX_HIT = 8;
// A Core HOLLOW ate to 0 comes back at this after an EMERGENCY TRANSMIT (§4.3), and no transmission
// (a crash's −25, the hits) ever delivers a Core below it: under 50 it already thinks one thing at a
// time (CORE_LOW_INTEGRITY), and much lower the glitch overlay would hide the screen.
export const CORE_RESET_INTEGRITY = 25;
// The extra hits and the Core's toll of the way a ship was left (§6.9): BEAM OUT is a hurried
// transmission (+2 hits), an EMERGENCY TRANSMIT out of a crash a desperate one (+3 hits, Core −25).
export const BEAM_OUT_EXTRA_HITS = 2;
export const EMERGENCY_EXTRA_HITS = 3;
export const EMERGENCY_CORE_HIT = 25;
// REPAIR CHARGE on arrival is never below this (§6.5: "a guarantee, not a fallback"): a unit that lost
// every star and spent everything still has two repairs of an 8-block file's bite for HOLLOW's fight.
export const CHARGE_ARRIVAL_FLOOR = 12;

// BEAM OUT (§4.3, §9 WP7 item 6). It is offered on a doomed ship: the impact is this close (tactical s),
// or the FUEL left can no longer lift ▼ out of the planet. Twenty seconds is the red end of the IMPACT
// countdown: long enough to read the offer, short enough that it never tempts a kid who can still save
// the ship by burning.
export const BEAM_OUT_OFFER_TAC = 20;
// The TRANSMITTING bar takes this many tactical seconds (world time: the antenna races the ground). It
// can be cancelled until it is full. Six seconds is a real race against a 20-second countdown.
export const BEAM_OUT_TAC = 6;
// "Can the tank still lift ▼ out of the planet?" flies the OUT burn ahead, at most this many game
// seconds of it (longer than any capture burn at full power on every ship).
export const BEAM_OUT_LIFT_MAX_SEC = 4000;
// Run 1's unit is UNIT-047 (§1): forty-six went before it. WP8's archive adds one per run.
export const FIRST_UNIT_NUMBER = 47;
// HALCYON's wall rule (`4 FREE BLOCKS STOP IT — REPAIR, then MOVE souls behind a WALL`) holds the strip
// this long at HOLLOW's wake: read twice, then the plain `SOMETHING IS EATING C08` lines name each
// cluster the repairs must reach (the rule is back as `MOVE C09 behind a WALL` once they are cured).
export const WALL_RULE_SHOW_SEC = 8;
// The strip's `MOVE your FIREWALL (FW) into the GAP next to ???` (WP8 fix round 1) stands this long at most:
// long enough to TAB in and pick up MOVE, then it gives the strip back (the Skills window keeps the hint).
export const FIREWALL_HINT_SHOW_SEC = 12;
// The naming (systems/hollow.ts; phase 2's HALCYON, VESPER's now): `???` flips to UNIT-046 this long after `> i was 046. they sent
// me first.` has typed out: the last letter lands, a breath, then the name changes on the strip.
export const HOLLOW_NAME_AFTER_TYPED_SEC = 0.4;

// HALCYON's own SHRINK THE LOOP numbers (ships.ts, the lead's per-ship shrink tuning; swept on HALCYON with
// AP_SHIP=1). "Already small" is the same 22,500 km as ship 1 (the same planet: the same periods, the same
// seconds of SKIP to the next pass), which is 3 × HALCYON's narrower ring...
export const HALCYON_SMALL_LOOP_FACTOR = 3;
// ...and a hand-over at the ring's inner edge backs off this much RETRO: at ×25, ▼ falls from the edge to
// the surface in about 2.8 tac s, so ship 1's 0.6 s back-off left 3.2–3.6 s of over-hold before IMPACT;
// 1.7 s gives ship 1's 4–5 s, and a release up to that late keeps ▼ in the ring (the two-burn fix).
export const HALCYON_EDGE_BACK_OFF_TAC = 1.7;
// KESTREL's (WP9, the lead's item: swept on KESTREL with AP_SHIP=2). The same
// planet and warp as HALCYON, a ring of 5,000–7,000: "already small" is again ship 1's 22,500 km, here
// 22,500 / 7,000 ≈ 3.2 × the ring's outer edge...
export const KESTREL_SMALL_LOOP_FACTOR = 3.2;
// ...and a hand-over at the ring's inner edge backs off this much RETRO, more than HALCYON's 1.7: KESTREL's tank
// (2.1 km/s) leaves less to spare, and its narrower ring makes a late release cost a third burn sooner. Swept
// (rule2-shrink, AP_SHIP=2): with 1.7 a release 2 s late already turned the fix into three burns (▼ TOO LOW at ▲)
// and locked with 17.9% FUEL, under the ★; with 2.5 a release 2 s late keeps the two-burn fix and locks with
// 20.5%, and the hand-over leaves 5.6 s of over-hold before IMPACT (1.7: 4.9 s).
export const KESTREL_EDGE_BACK_OFF_TAC = 2.5;
// VESPER's (WP10, the lead's item 2: swept on VESPER with AP_SHIP=3, its controller swapped: AP_GHOST=quiet; logs in
// WP10's sweeps). KESTREL's ring and planet, but ×30: a second of over-hold drops ▼ further, so KESTREL's 22,500 km
// "already small" (3.2) left a capture let go and ignored 60 s handing over at ▲ 27,600 km with only the 3 s margin,
// and a release 1 s late already turned the fix into three burns (`▼ TOO LOW — at ▲ press [W]`, 20.4% FUEL left).
// At 5.0 (35,000 km) that hand-over keeps the full 5 s margin: a release 1 s late keeps the two-burn fix (22.5%), 2 s
// late locks with 18.7% (3.2: 16.2%), and the ignored-60 s flight locks with 24.6% (3.2: 23.7%). 5.5 ends that shrink
// within 2 s (too short to read), and no factor kept a 2 s late release to two burns. Rule 4's sweeps are unchanged.
export const VESPER_SMALL_LOOP_FACTOR = 5.0;
// ...and the ring-edge hand-over's back-off: KESTREL's 2.5 (the same ring). Swept 1.7–4.5 with both factors: no flown
// row of rule2-shrink changes (VESPER's flown hand-overs end on the margin, not at the ring's edge of a small loop);
// only the planted target rows move (more back-off, fewer shrinks: 1,160 at 3.0 against 1,111 at 4.5).
export const VESPER_EDGE_BACK_OFF_TAC = 2.5;

// --- WP7 part 2: the run on screen (TRANSMIT, the arrival, BEAM OUT, RUN END) ----------------------------

// TRANSMIT (§4.1 step 5). The screen ignores SPACE / ENTER this long after it opens: SPACE is also the
// WAKE REPORT's CONTINUE, and a kid mashing through the report must still see where the unit is going.
export const TRANSMIT_ARM_SEC = 1.0;
// The send: the files stream out one by one while the light-years tick past and the FM sweep rises. Long
// enough to feel the 22 light-years and the stake (the files about to be hit), short enough to never be
// dead time. The chips leave in the first TRANSMIT_STREAM_FRAC of it.
export const TRANSMIT_SEND_SEC = 2.2;
export const TRANSMIT_STREAM_FRAC = 0.7;
// The white-out at the end of the send (§9 WP7 item 4): the screen floods white, holds, and the new ship
// comes up from under it while it fades. The world reset happens at full white, so nothing jumps.
export const WHITE_OUT_IN_SEC = 0.35;
export const WHITE_OUT_HOLD_SEC = 0.25;
export const WHITE_OUT_FADE_SEC = 1.1;
// The hold starts when the flood reports its end (transitionend; slice 3b review: on a busy page the old timer could cross
// before a frame drew any white). This long past WHITE_OUT_IN_SEC the hold starts anyway (a flood that never reports).
export const WHITE_OUT_FLOOD_GRACE_SEC = 1;

// The arrival's red flashes (§4.1 step 1, §9 WP7 item 3): as the boot's ECC line types, each file a transit
// hit landed on flashes red with what it lost, one after another, so the kid sees WHERE the crossing hurt.
export const ARRIVAL_HIT_STAGGER_SEC = 0.32;
export const ARRIVAL_HIT_FX_MS = 1700;
// A skip never cuts the crossing's damage out of the boot (WP7 fix round 1): SPACE is also the key that just
// CONTINUEd and TRANSMITted, so a kid mashing it skipped every arrival straight to amber and heard the hits
// crackle over nothing. On an arrival boot the first skip jumps to the ECC line (its flashes start at
// once), and the next is honoured only once the last flash has been on screen this long.
export const ARRIVAL_HIT_SEEN_SEC = 0.9;

// BEAM OUT (§5.3 signature 14): when the bar fills, the old ship's windows cut to black, and the next
// screen (TRANSMIT, or RUN END on the last ship) comes up after this long: the moment the unit left.
export const BEAM_OUT_BLACKOUT_SEC = 1.6;
// ...and the sweep that carries the unit away as they go black: a short one (the full TRANSMIT sweep is
// the send's own, on the next screen).
export const BEAM_OUT_SWEEP_SEC = 0.7;

// HOLLOW names itself (on the ship it boards): `???` decodes into UNIT-046 on every hollow block over this long, a letter
// at a time through static, as the truth note falls. Seen later (the kid was flying), it plays this long
// after the jack-in, once the scanline wipe has cleared.
export const HOLLOW_NAME_DECODE_MS = 1100;
export const HOLLOW_NAME_SEEN_DELAY_SEC = 0.35;

// RUN END (§9 WP7 item 7). Input waits this long (SPACE ended the last screen too); the ship rows land one
// by one this far apart, each with a heartbeat, and the WOKE count rolls up over RUN_END_COUNT_SEC.
export const RUN_END_ARM_SEC = 1.5;
export const RUN_END_ROW_GAP_SEC = 0.45;
export const RUN_END_COUNT_SEC = 1.6;
// A ship's stars (§4.4: ORBIT LOCKED, INTACT, FUEL): RUN END draws the missed ones as ☆ beside the earned.
export const STARS_PER_SHIP = 3;
// The rank (§4.4), by the run's SCORE (landing points), against RANK_FLEET_COLONISTS: DRIFTER under 3,000, SHEPHERD,
// CARETAKER, ARK ANGEL. Each threshold scales with the colonists the fleet has (9,600 in slice 1a), rounded to
// RANK_ROUND_TO, so the top rank stays reachable and the gap lines stay honest.
export const RANKS: readonly { name: string; minScore: number }[] = [
  { name: 'DRIFTER', minScore: 0 },
  { name: 'SHEPHERD', minScore: 3000 },
  { name: 'CARETAKER', minScore: 6800 },
  { name: 'ARK ANGEL', minScore: 10700 },
];
export const RANK_ROUND_TO = 100;
// Near misses on RUN END (§4.4): at most this many lines, so they read as a nudge, not a report. A locked
// ship's FUEL counts as a near miss within this many points under the ★.
export const NEAR_MISS_LINES_MAX = 2;
export const NEAR_MISS_FUEL_PCT = 5;

// --- WP8: what carries over (the draft, upgrade files, the archive, the ghost; §4.5, §5.2, §6.9) ---------

// The draft between ships (§6.9 `PICK ONE TO CARRY`): this many distinct cards, one of them mandatory.
export const DRAFT_CARDS = 3;
// A card's weight before the run's stats boost it. Every card can come up, so a kid who played
// cleanly still sees the whole pool across a run.
export const DRAFT_BASE_WEIGHT = 1;
// The boosts (§6.9's table): a card answers the trouble the kid had. With clustersLost ≥ 1, FIREWALL at ×3
// against four cards at ×1 is in about 89% of drafts (acceptance: ≥ 60% of 1,000 seeds).
export const DRAFT_FIREWALL_BOOST = 3;
export const DRAFT_FIREWALL_LOST_MIN = 1;
export const DRAFT_REPAIR_V2_BOOST = 3;
export const DRAFT_REPAIR_V2_REPAIRS_MIN = 5;
export const DRAFT_THREAD_BOOST = 2;
export const DRAFT_THREAD_REFUSALS_MIN = 3;
export const DRAFT_CHARGE_BOOST = 2;
// "charge < 15": the unit holds fewer than this at TRANSMIT.
export const DRAFT_CHARGE_BELOW = 15;
export const DRAFT_FUEL_TRIM_BOOST = 2;
// "last fuel left < 20%": the ship just left ended with less FUEL than this (the ★ notch, STAR_FUEL_PCT).
export const DRAFT_FUEL_TRIM_BELOW_PCT = 20;
// The mild step of each boost (WP8 fix round 1, the lead's note: the draft must answer how the kid played).
// §6.9's thresholds are trouble a clean tutorial never reaches (5 REPAIRs, a lost cluster, FUEL under the ★),
// so its draft said `ARRIVAL CONTROL had a spare` on two or three cards. A taste of the same trouble gives the
// card a smaller push and its reason: a bite on a cluster (the ARRIVAL stage's scripted bite counts, saved or not), a
// second REPAIR (the ENGINE I/O lesson is the first), one refused click on busy THREADS, a sixth of a fresh
// unit's 36 REPAIR CHARGE spent, half the FUEL burned. Small against the strong boosts, so FIREWALL after a
// loss still leads (about 80% of drafts against four mild cards).
export const DRAFT_MILD_BOOST = 1.5;
export const DRAFT_FIREWALL_BITTEN_MIN = 1;
export const DRAFT_REPAIR_V2_MILD_MIN = 2;
export const DRAFT_THREAD_MILD_MIN = 1;
export const DRAFT_CHARGE_MILD_BELOW = 30;
export const DRAFT_FUEL_TRIM_MILD_BELOW_PCT = 50;

// FIREWALL.sys and FUEL TRIM are 2-block files (§6.9): small enough to MOVE anywhere, big enough to see.
export const FIREWALL_BLOCKS = 2;
export const FUEL_TRIM_BLOCKS = 2;
// How many of each file a unit may own (§6.9 "FIREWALL (stack 2)"). Two FIREWALLs can seal both sides of
// the root; two FUEL TRIMs widen the budget twice. REPAIR v2 and THREAD+ change a file once; the charge card
// stacks without limit, so a draft always has three cards to show in a five-ship run (WP8 deviation).
export const FIREWALL_MAX_OWNED = 2;
export const FUEL_TRIM_MAX_OWNED = 2;
// REPAIR v2 and THREAD+ are one-offs (§6.9: owned non-stackables are excluded): a second REPAIR v2 would
// change nothing, and §6.5's THREAD+ makes the Core three threads, not four.
export const REPAIR_V2_MAX_OWNED = 1;
export const THREAD_PLUS_MAX_OWNED = 1;
// FUEL TRIM: each live file at or above BAND_DEGRADED_MIN widens the next arrival's Δv budget by this
// share (§6.9 "+15% Δv budget on arrival"). Read at the arrival only: consumed mid-ship, it applies from
// the next arrival (§9 WP8 edge case).
export const FUEL_TRIM_DV_BONUS_FRAC = 0.15;
// THREAD+ raises the Core's capacity by one thread (§6.5: "THREAD+ or the MERGE bonus makes it 3").
export const THREAD_PLUS_THREADS = 1;
// +12 REPAIR CHARGE (§6.9): added on arrival with the star credit, before the floor.
export const CHARGE_CARD_BLOCKS = 12;

// The archive's key and version moved to the `3c SAVE` block (archive v2).
// A MERGE makes HOLLOW the two units together (`UNIT-046·047`, §4.5). The name keeps at most this many
// units, the newest: a chip on the strip and a ≤ 70-character ghost line still fit after many merges.
export const HOLLOW_NAME_MAX_UNITS = 2;

// The run-2 boot (§5.2): the ghost line types first, at HOLLOW's slow speed, from this moment; the boot's
// own lines follow BOOT_AFTER_GHOST_SEC after its last letter. A skip waits until it has typed: the
// ghost's greeting is the moment run 2 is about, and SPACE is the key a returning kid mashes.
export const BOOT_GHOST_AT_SEC = 0.5;
export const BOOT_AFTER_GHOST_SEC = 0.6;

// --- WP9: KESTREL (hazard zones, seeds, AUTOBURN; §4.2, §6.6, §6.8, §6.10) --------------------------------

// Debris (§3.3 P3, §6.8): the first time the true path enters the cloud, every file with blocks in its rack
// loses this × (its blocks in the rack ÷ its size). A cluster wholly in the rack loses a quarter: it still
// wakes, with gaps, unless the kid repairs it (25 points of an 8-block cluster cost 4 REPAIR CHARGE).
export const DEBRIS_HIT_DAMAGE = 25;
// The belt (§6.8, LAST LIGHT; built and tested here): while inside, hits come as a Poisson process in game
// time with this mean gap (P(hit) per tick = 1 − exp(−dt/τ), at most one a tick), each −8 to a random
// damageable file in the belt's racks that no op holds (a pick an op holds is drawn again this many times).
// A 1,080 game-s crossing averages 5.4 hits: enough to hurt, few enough to repair.
export const BELT_HIT_MEAN_SEC = 200;
export const BELT_HIT_DAMAGE = 8;
export const BELT_TARGET_REROLLS = 1;
// Pace (§6.8): TACTICAL from this many tactical seconds before a zone entry until the exit, so contact is
// always seen at real-second speed. A running SKIP ends when this lead begins (pace.ts): the TACTICAL rule
// would hold the world at ×25 under it anyway (the spec's 15 s SKIP end lead is the shorter of the two).
export const ZONE_TACTICAL_LEAD_TAC = 20;
// The strip's `DEBRIS HITS RACK C IN 1:10 — MOVE souls out of it` (script.ts): once a correction can no
// longer clear the cloud (the flight's line is past the IN correction), shown while contact is at most this
// far off. A minute and a half is time for two threads to MOVE a few clusters into rack D.
export const DEBRIS_MOVE_HINT_TAC = 90;

// Seeds (§6.6): a 2-block HOLLOW block, telegraphed by a blinking outline for this many AI seconds before it
// lands (the kid sees where, and DELETE arrives with the first one).
export const SEED_BLOCKS = 2;
export const SEED_TELEGRAPH_SEC = 2;

// AUTOBURN's demos (§6.10; 03 §3.3): it learns half the mean START BURN offset of the kid's last AUTO_DEMO_WINDOW manual
// captures (a sloppy teacher makes a sloppy skill), clamped to ±8 tactical s, and its ACCURACY is 100 − 8 per tactical
// second of that, within 40..99 (systems/skill-tree.ts demoSkill, AUTOBURN_DEMO_TUNING). Phase 2 counted every capture;
// "the last 8" lets improvement show. Slice 4: the skill is bought (data/skills.ts), no longer installed after two captures.
export const AUTOBURN_OFFSET_FACTOR = 0.5;
export const AUTOBURN_OFFSET_MAX_TAC = 8;
export const AUTOBURN_ACCURACY_PER_TAC = 8;
export const AUTOBURN_ACCURACY_MIN = 40;
export const AUTOBURN_ACCURACY_MAX = 99;
export const AUTO_DEMO_WINDOW = 8;
// A skill bought before any manual capture is UNTRAINED (03 §3.3: 40%). Read through the ACCURACY rule, 40% is an offset
// of (100 − 40) ÷ 8 = 7.5 tac s, so it fires that late (plan §7 R3, the lead's decision): at offset 0 an untrained skill
// would be perfect, and buying without ever capturing by hand would be the best AUTOBURN ("trained by you" would die).
export const AUTOBURN_UNTRAINED_OFFSET_TAC = 7.5;
// `AUTOBURN: CAPTURED — trim it green yourself` stays on the strip this many AI seconds after the hand-back.
export const AUTOBURN_DONE_LINE_SEC = 4;
// A lost skill mid-burn (§6.10): the klaxon and `AUTOBURN.skl LOST — MANUAL` stand this long, then the flight's
// own line (HOLD [SPACE] NOW) takes the strip back.
export const AUTOBURN_LOST_ALARM_SEC = 2.5;

// The first seed's `RM THE SEED — pick up DELETE, click the seed` (script.ts) stands this long at most: long
// enough to TAB in and DELETE it; then the strip goes back to the flight (the line returns for any seed that can bite).
export const SEED_LESSON_SHOW_SEC = 15;
// `AUTOBURN READY — press [B] and it brakes at ▼ for you` (script.ts), once a run: this long at most. The capture
// lines keep offering ` · or [B] AUTO` after it.
export const AUTOBURN_READY_SHOW_SEC = 10;

// The debris dodge (predict.ts debrisDodge, WP9 review round 1). The strip promises `· 0:40 to dodge DEBRIS C` only
// while the ▼ correction started then, held to the sweet zone's far edge, passes the cloud with this many km to
// spare. The model stops its burn exactly there; the kid, told KEEP HOLDING — dodge DEBRIS C until the path clears,
// lets go a little after it clears (a tick, a 10 Hz refresh, a reaction), which only takes the path farther off: on
// KESTREL every promised start dodged, by 0.3–25 km. The margin covers a start a tick or two late and the engine's
// jitter, and costs the window about a tactical second of its 152 (each second later passes about 10 km nearer). The
// window is judged with as many Core threads busy as the Core holds (LEAD-2, predict.ts dodgeAccel): that, not this
// margin, is what keeps a start in its last seconds from failing while two REPAIRs run.
// (The first model stopped a sub-step past the first RELEASE: that overshoot made it the optimist, and a promise
// with no margin was broken by 4–11 km.)
export const DODGE_PROMISE_MARGIN_KM = 10;
// The deadline's search stops this close (tactical s) to the true edge: well under the countdown's whole second.
export const DODGE_DEADLINE_RESOLUTION_TAC = 0.05;
// The deadline is worked out once per coast and kept by the coast's conic (predict.ts dodgeKey), rounded to these
// decimals: ▼ to 0.1 km, the eccentricity and the ▼ direction to 1e-7. On a pure coast the integrator only moves
// them in later digits; the smallest tap of the engine moves them in these.
export const DODGE_MEMO_RP_DECIMALS = 1;
export const DODGE_MEMO_ANGLE_DECIMALS = 7;

// The lead's ruling for WP9 fix round 1, made whole in round 2 (`· 0:24 to dodge DEBRIS C`):
// • the countdown turns the warning colour for its last DODGE_WARN_TAC tactical seconds;
// • the world drops to TACTICAL for the same stretch, as for a burn (pace.ts), so those seconds are real seconds
//   (at CRUISE ×80 the last 10 lasted 3 wall s); a SKIP ends SKIP_END_LEAD_TAC before the deadline, ahead of it;
// • a timed HOLLOW wake waits while the dodge is open and WAKE_AFTER_DODGE_SEC (AI s) after it closes (hollow.ts):
//   the TOO LATE TO DODGE stamp, or CLEAR OF THE DEBRIS and the RELEASE after it, get a moment of their own before
//   the first bite (round 1 gave the lapse 10 s by putting KESTREL's latest wake at 60 s, which held only at CRUISE).
export const DODGE_WARN_TAC = 10;
export const DODGE_TACTICAL_LEAD_TAC = DODGE_WARN_TAC;
export const WAKE_AFTER_DODGE_SEC = 8;

// --- WP9 part 2: KESTREL on screen and in the ears (§6.8, §7.2, §7.3) -------------------------------------

// §7.3: the screen shakes 6 px when debris hits a rack (between the ENGINE I/O FAULT's 4 and a crash's 10).
export const SHAKE_DEBRIS_PX = 6;
// The red flash on a hit rack's rows (the strip in blue, the mini-strip in amber), and the belt's per-hit one.
export const RACK_FLASH_MS = 900;
// The MIND's rack tags (`DEBRIS 03:30` under `RACK C`) and the mini-strip's lit row are patched this often: a
// countdown in whole seconds needs no more.
export const RACK_TAG_PAINT_HZ = 4;
// §7.2 geiger: a belt hit plays a short flurry of ticks, and only a hit (playtest 1 note 22, OPEN-DECISIONS 137: the
// Poisson stream that used to run under the whole belt is gone, the bed below is the belt's sound). Small, so a hit is
// heard over the bed without the sharp clicks Fran found painful on headphones.
export const GEIGER_HIT_CLICKS = 4;
export const GEIGER_HIT_SPREAD_SEC = 0.25;
// The belt's bed (playtest 1 note 22, plan §3.11; audio.ts setBeltLevel): flat white noise plus a quieter static
// crackle, one continuous voice while the ship is inside a belt. The bursts it replaced (one every 1.4–3 s, each with a
// rise, hold, fall and a 20 Hz flutter) breathed like a horse huffing. Its level rises smoothly with the depth, from
// the edge's to the middle's, in dBFS at the output (measureCue's loudest 50 ms: about −29 and −21): at the edge under
// HOLLOW's chew (about −28 at its loudest), at the middle level with a full burn's rumble (about −22), loud enough to say
// "you are in it". TAU is how fast the level follows the depth (and the way in): a fade, never a step or a ripple.
export const BELT_BED_EDGE_DBFS = -30;
export const BELT_BED_PEAK_DBFS = -22;
export const BELT_BED_TAU_SEC = 0.4;
// The static layer's clicks per second: dense enough to crackle like a radio between stations, not to tick.
export const BELT_STATIC_CLICKS_HZ = 400;
// A seed's warning outline blinks this often (§6.6 "a blinking outline for 2 AI-s"): four blinks in the
// telegraph, each with a blip in HOLLOW's voice, so the warning is heard from the amber screen too.
export const SEED_BLINK_SEC = 0.5;

// --- WP10 part 2: VESPER on screen and in the ears (§7.2, §7.3, §9 WP10 items 2 and 5) ---------------------------

// §7.3: the ship's first uncommanded burst slams the screen like debris (6 px: nobody touched SPACE, so it must feel
// like something happening TO the ship); every later burst is a 3 px kick, felt but not alarming (the counter and the
// pip say it is still going on).
export const SHAKE_GHOST_FIRST_PX = 6;
export const SHAKE_GHOST_PX = 3;
// A TERMINAL choice's timer (THE DEAL's) turns the warning colour, pulses and ticks higher for its last seconds, in
// the TERMINAL and on the ticker: the 15 s must feel like pressure (the lead's note), and the last five are where a
// kid who is still reading has to decide.
export const CHOICE_URGENT_SEC = 5;
// MERGE (§1, §6.6 ship 5) costs this much REPAIR CHARGE. VESPER's boot line foreshadows it (`> keep 16 charge for me,
// 047. you'll see.`, §9 WP10 item 5), so the number is the same constant WP11's MERGE will charge.
// Slice 8 (plan §2.10, OPEN-DECISIONS 88 and 108, [FRAN] confirm): 16, was 20. The playthrough on R5's four routes (16 seeds,
// strip landings, the runs played for MERGE) reached the choice with 20 in 36% of COMPETENT's runs and 32% of LITERAL's; at
// 16, 46% and 36%; at 14, 50% and 39%. 16 takes most of what the ladder gives and stays 4 over the FULL ship's arrival
// floor (CHARGE_ARRIVAL_FLOOR 12), so a kid who spent nothing still can't MERGE. The runs still short hold 0–13 (the 5-ship
// route's compressed HOLLOW, the TIGHT receiver's squeeze): no price over the floor reaches them. To reverse: 20.
export const MERGE_COST_CHARGE = 16;
// VESPER's boot: after HOLLOW's line has typed (it is slow, HOLLOW_TYPE_CPS), the klaxon waits this long more, so the
// line is read before the cut to amber (the boot's other lines get BOOT_KLAXON_AFTER_LAST_LINE_SEC from their start).
export const BOOT_AFTER_HOLLOW_LINE_SEC = 1.0;

// --- WP11: LAST LIGHT, HOLLOW's verbs, the root duel, PURGE or MERGE (§4.2, §6.6, §9 WP11) -------------------------

// LAST LIGHT's own SHRINK THE LOOP numbers (ships.ts, the lead's per-ship tuning; swept on LAST LIGHT with AP_SHIP=4,
// WP11's sweeps). VESPER's ring and planet at VESPER's ×30, so its numbers are the starting point.
export const LAST_LIGHT_SMALL_LOOP_FACTOR = 5.0;
export const LAST_LIGHT_EDGE_BACK_OFF_TAC = 2.5;
// HOLLOW's verbs (§6.6 ship 5): the weights are 1 + the last unit's MOVEs (MV) or DELETEs (RM) over this many, so a
// unit that moved a lot is fought with moves ("it fights like you did", §4.5) without either verb ever vanishing.
export const VERB_WEIGHT_PER_STAT = 10;
// MV's aim (§6.6: "the free region nearest the most soul blocks"): a spot's pull is the soul blocks within this many
// blocks of it, either way. One rack: a block parked between two full racks of colonists pulls harder than one at
// the edge of a lone cluster.
export const VERB_MV_NEAR_BLOCKS = 64;
// A cluster HOLLOW has bitten this many times in the same spot is in a trap (WP11 review, the lead's ruling of 21:30):
// the strip asks to MOVE it behind a WALL before the next bite, ahead of the quieter lines. On LAST LIGHT the root's
// 2-block GAPs bit C13 and C14 every 12 s, and repairing them again and again drained the charge MERGE needs. WP12 (the
// lead's note for part 1, 01:35; tests/unit/wp12 LITERAL, the kid who does only what the strip says): at two bites that kid
// reached LAST LIGHT's choice with MERGE's 20 charge in 49 of 196 runs (COMPETENT 124 of 200), having paid a second
// REPAIR on every trapped cluster on every ship; at one, 149 of 199, and its souls woke 95% → 98.5%. The first bite
// still teaches REPAIR: the ask comes only once that cluster is cured and HOLLOW will bite it there again.
export const BITTEN_AGAIN_COUNT = 1;
// The ship-5 root's DELETE (§6.5: "the ship-5 root takes 12 s"), whatever its size: the duel's one long op, during which
// the verbs come every duelEverySec.
export const ROOT_DELETE_SEC = 12;
// What the root leaves when its DELETE completes (§6.6: "a single last block"): one block, in the middle of where the
// root was, so a WALL stands on both sides of it (it no longer bites, but the strip must not read `GAP 2` beside it).
export const LAST_BLOCK_SIZE = 1;
// glitchBurst (§7.3): a verb landing, HALCYON's naming and the duel's spikes flash the glitch overlay to this level
// for this long (§9 WP11 item 3: glitchBurst(0.3, 400)). Under reduced motion it is a dim pulse of the same length.
export const GLITCH_BURST_LEVEL = 0.3;
export const GLITCH_BURST_MS = 400;
// The strip's `BELT HITS RACKS A–B IN 1:10 — MOVE souls out of RACK B` (script.ts, LAST LIGHT): shown while the belt's
// entry is at most this far off and colonists are still in its racks. As long as the debris's: time for two threads to
// MOVE a few clusters out of rack B (§4.2: "move souls out of rack B before crossing").
export const BELT_MOVE_HINT_TAC = 90;

// --- WP11 part 2: the verbs' telegraph, the duel's spikes, the choice and the typed endings -----------------------

// A verb's countdown (§6.6: `> unlink repair.bak ... 3`), the AI seconds the kid has to block it with any tool: LAST
// LIGHT's VerbDef (ships.ts) takes these. The ship's first verb, of either kind, counts from VERB_FIRST_TELEGRAPH_SEC
// (Fran's call after the handover): that one is where the kid learns the drill (read the TERMINAL, find the marked file,
// pick a tool, click it), so it gets a second more; every later one is the known drill in VERB_TELEGRAPH_SEC. On the
// coast the next verb still comes everySec after the first one's start (8 s of calm after it instead of 9), so every
// later verb keeps its time; in the duel, whose 4 s clock has no room, the extra second pushes the next verb back
// (systems/hollow-verbs.ts).
export const VERB_TELEGRAPH_SEC = 3;
export const VERB_FIRST_TELEGRAPH_SEC = 4;

// The duel's glitch spikes (§9 WP11: "the DELETE duel runs with glitch spikes", §7.3): while the root's DELETE runs,
// HOLLOW thrashes. A spike every DUEL_SPIKE_EVERY_START_SEC at the DELETE's start, quickening to every
// DUEL_SPIKE_EVERY_END_SEC near its end, from DUEL_SPIKE_LEVEL_START to DUEL_SPIKE_LEVEL_END: the screen tears more the
// closer the root is to gone, so the 12 s build to the moment. Short (DUEL_SPIKE_MS), so a verb's countdown and the
// strip stay readable between them; a verb landing (GLITCH_BURST_LEVEL) still stands out above the early ones.
export const DUEL_SPIKE_EVERY_START_SEC = 2.0;
export const DUEL_SPIKE_EVERY_END_SEC = 0.8;
export const DUEL_SPIKE_LEVEL_START = 0.15;
export const DUEL_SPIKE_LEVEL_END = 0.4;
export const DUEL_SPIKE_MS = 220;
// The root opening at ORBIT LOCK (a burst like a verb's), and the root's DELETE completing: the biggest tear of the
// game, held long enough to feel like something large going out, then quiet for the choice.
export const ROOT_GONE_GLITCH_LEVEL = 0.6;
export const ROOT_GONE_GLITCH_MS = 900;
// MERGE: it comes into you. A long, rolling burst that settles into the faint floor the next run keeps.
export const MERGE_GLITCH_LEVEL = 0.5;
export const MERGE_GLITCH_MS = 1600;
// The choice card's delay and arming moved to slice 7a's FINALE block (FINALE_OPEN_DELAY_SEC, FINALE_STEP_ARM_SEC).
// The typed ending (§9 WP11 item 5; slice 7a: the verdict, at most FINALE_VERDICT_MAX_LINES lines), typed at
// FINALE_ENDING_CPS (slower than the TERMINAL: it is the story's last words) with FINALE_ENDING_GAP_SEC between lines and CONTROL's chime before its line, then held for
// FINALE_ENDING_HOLD_SEC to be read. The WAKE REPORT waits for it (finalePending); a click or a key ends it early.
// UNRESOLVED's one line (`> you can't delete me now. …`) gets the same hold once it has typed (WP11 review).
export const FINALE_ENDING_CPS = 26;
export const FINALE_ENDING_GAP_SEC = 0.7;
export const FINALE_ENDING_HOLD_SEC = 4.0;

// --- Phase 3 slice 1a: LANDING (docs/phase3/01-landing.md; Track SIM owns this block) --------------------------------

// A pod driver is 8 blocks (§3.8): v2 §6.6's validated rule (an 8-block file's heal beats 1.5 × the drain) then holds
// unchanged for whatever HOLLOW does to drivers, and an 8-block chip still reads `POD 03 · OKAFOR`.
export const DRIVER_BLOCKS = 8;
// Each pod carries 200 colonists (§1): the old cluster's size, so the fleet's numbers and ranks keep their scale.
export const COLONISTS_PER_POD = 200;
// INSPECT and the LANDING REPORT name this many colonists per pod: enough to read as a family, few enough to read.
export const FEATURED_PER_POD = 3;
// At most 16 pods on any ship (decision 9): twenty do not fit 384 blocks with the 40-block pod-rack margin (§3.16).
export const PODS_MAX = 16;

// The bay (§3.4). 4 slots: PHASE3's "3–4", and four launches fill one healthy sure window.
export const BAY_SLOTS = 4;
// Tactical seconds between two launches: a rhythm a kid can tap, four pods in 6 s. 1a uses it whatever Bay Ctrl's band
// (1b reads a per-band table).
export const BAY_CADENCE_TAC = 2.0;
// Tactical seconds of WORLD time to reload one slot: any SKIP refills the bay, and two LZs closer than about 40° of arc
// (four reloads at 6,000 km) share one load, which is PHASE3's split decision.
export const BAY_RELOAD_TAC = 20;

// The drop (§3.3). Half-width s = DROP_KM_PER_1000 × (launch radius − R) / 1,000 × the factors. 30: a healthy drop fits
// a STANDARD LZ anywhere in a 5,000–7,000 band (±48 to ±108 km), and only damage forces an orbit choice.
export const DROP_KM_PER_1000 = 30;
// The pod's retro kick aims its lowest point at this share of R: the arc then lands 70–88° ahead of the ship on every
// band (70° from 5,000 km, 88° from 9,000), reads as "down and forward", and never wraps round the planet.
export const POD_AIM_RP_FRAC = 0.6;
// The fall is shown on AI time (a real one is 105–270 tactical s): the streak runs its true arc in this many AI seconds,
// a ritual like the lock hold, its result decided at launch. Run 1's first pod falls slower: the first landing's moment.
export const POD_DESCENT_SEC = 3.5;
export const POD_FIRST_DESCENT_SEC = 5.0;
// The drop solution samples one orbit this finely (1° of a circular orbit, so a STANDARD LZ spans about 7 samples), then
// refines each window edge on exact evaluations; the solve is cached per orbit and costs a few ms.
export const DROP_SOLVE_SAMPLES = 360;
// Points on the drawn pod arc: smooth at the NAV PLOT's size, cheap to rebuild at PREDICT_HZ.
export const POD_ARC_POINTS = 40;

// LANDING's own warps on every ship (§3.2), set at ORBIT LOCK: the window table (8 sure seconds at ×20) then holds on
// every planet. ×20 is ship 1's flight warp; ×60 its cruise.
export const LANDING_TACTICAL_WARP = 20;
export const LANDING_CRUISE_WARP = 60;
// TACTICAL this many tactical seconds before a window opens, and a SKIP lands there: the burn lead's value, so GET READY
// counts down the same 5…1 a burn does, with no CRUISE dead time before it.
export const WINDOW_TACTICAL_LEAD_TAC = 8;

// Scoring (§3.9, decided by Fran): points per pod = colonists × place × touch.
// A pod that lands in an LZ already at its count is mislanded: three quarters (each colonist counts once: 400 + 800 → 1,150).
export const MISLANDED_FACTOR = 0.75;
// A failing driver lands hard: half points.
export const HARD_LANDING_FACTOR = 0.5;
// Off-site, by the planet's forgiveness class (§3.6): what the planet allows. An ocean world forgives nothing.
export const OFF_SITE_SCORE_BY_CLASS: Readonly<Record<ForgivenessClass, number>> = { gentle: 0.5, rough: 0.25, harsh: 0 };

// LZ widths in km of surface arc (§3.5): WIDE 500 (8.45° at R 3,390), STANDARD 400 (6.76°), NARROW 250 (4.23°). A
// NARROW LZ gives 3–4 sure seconds (two pods) even healthy and low.
export const LZ_WIDTH_KM: Readonly<Record<LzWidth, number>> = { wide: 500, standard: 400, narrow: 250 };
// Brackets sit at least this far apart edge to edge, so two windows never overlap (§3.5).
export const LZ_MIN_GAP_DEG = 12;

// The memory budget (§3.16). The unit may spill this many blocks into the end of the last pod rack (its "tail"): the
// room for you is the receiver plus this, one fixed number per memory class.
export const UNIT_TAIL_BLOCKS = 24;
// The pod racks keep at least this many free blocks, the root's gaps not counted: the 24-block tail plus 16 for walls
// and MOVEs (phase 2's calm-rack margin).
export const POD_RACK_MIN_FREE = 40;

// The GROUND TRACK's main strip shows this much surface, centred on the dot: on the whole plot a 400 km bracket is only
// 8–10 px, so the panel is the one place a kid can see the dot in the bracket.
export const GROUND_TRACK_SPAN_KM = 3000;

// With the ship empty, the landing lingers this long before the LANDING REPORT: the last bell and `+200 LANDED` land
// before the screen changes.
export const LANDING_DONE_LINGER_SEC = 1.5;
// A landing in which no pod aboard has a driver left ends itself after this many AI seconds (risk 7, the phase-2 printer
// gave up after 8 s): headless kids and AFK players never stall, and the strip says L12 meanwhile.
export const LANDING_NONE_LEFT_SEC = 6;
// A colony is called after its first family this often (`OKAFOR LANDING`), else it takes a name from the pool (05 §).
export const COLONY_FAMILY_NAME_CHANCE = 0.5;
// A launched driver's chip flash lives this long on screen (wall ms): PrintFx's timing, reused as the launch flash.
export const LAUNCH_FX_MS = 1400;

// ★ ON TARGET (§3.9): at least this share of the colonists aboard landed soft in an LZ with room. The denominator
// includes pods that never launched; with 200-colonist pods one miss in a small ship already costs it.
export const STAR_ON_TARGET_FRAC = 0.95;

// MERGE in 1a (risk 9): an eaten driver comes back in place at this integrity, the bottom of the ok band, so the driver
// never makes its pod land hard (§3.17: the people come back whole).
export const MERGE_DRIVER_INTEGRITY = 80;

// The ranks' thresholds were authored against the phase-2 fleet's 12,400 colonists; they scale by the fleet's real
// colonists (9,600 in slice 1a), so perfect landings are now needed for the top ranks (risk 11).
export const RANK_FLEET_COLONISTS = 12400;

// --- Landing UI (slice 1a, Track UI) ---------------------------------------------------------------------------------

// A falling pod's streak shows this share of its arc behind the head (§4 "a streak with a trail"): long enough to read as
// motion along the arc, short enough that two pods 2 s apart are two streaks, not one line.
export const STREAK_TRAIL_FRAC = 0.3;
// Pods parked in orbit ride the ship's orbit as beacons (§3.10), this share of a period apart behind the ship: a short
// string of blinking dots that reads as "left up here", clear of the ship's own glyph.
export const BEACON_LAG_FRAC = 0.03;
// The GROUND TRACK names at most this many LZs waiting past its right edge (`LZ-B ▸ 2:10`): the next one and the one
// after are a plan; more is a list nobody reads in a 56 px panel.
export const GROUND_TRACK_AHEAD_MAX = 2;
// `+200 LANDED · LZ-A` floats up from the bracket this long (wall ms): the bell's decay, so the words and the sound end
// together.
export const TOUCHDOWN_FLOAT_MS = 1600;
// The screen kicks this much per launch (§4 juice "2 px shake per launch"): felt at the 2-second rhythm, never tiring.
export const SHAKE_LAUNCH_PX = 2;
// The LANDING REPORT counts its LZ rows up one after another, this far apart (wall s), each with a heartbeat: the rows
// are the ship's result, so they get a beat each before the credits roll.
export const REPORT_LZ_ROW_GAP_SEC = 0.45;
// Each pod icon in a counting row lands this far after the previous one (wall s): a ship of 4 pods per LZ fills a row in
// under a second.
export const REPORT_POD_ICON_GAP_SEC = 0.12;
// The POD BAY window slides in this long after ORBIT LOCK (wall ms): after the lock's stamp has hit, so the two moments
// don't land on the same frame.
export const POD_BAY_OPEN_DELAY_MS = 900;

// =====================================================================================================================
// --- Phase 3 slice 1b: drop width, no-go arcs, Bay Ctrl, drag and decay, the engine in landing, GO LOWER
// (docs/phase3/01-landing.md §3.3–§3.12, docs/phase3/impl/slice-1b-plan.md §2.2). Three sub-blocks, each owned by one
// track: a track edits only its own. Every 1b number is here, so the rebalance (slice 8) has one place to look.
// =====================================================================================================================

// --- 1b DROP (owned by Track DROP): the drop width's factors, Bay Ctrl, no-go arcs, DROP UNCERTAIN --------------------

// Sensor Interp's factor on the drop width, by band (§3.8): it reads the ship's own state, so a damaged one blurs where
// the pod is let go. failing / dead / missing all ×2.5 (and the grey dot): the plot is already PATH UNCERTAIN there, and
// a blind drop must be wide enough that REPAIR SENSOR INTERP is plainly the fix (±195 km at 6,000 km: STANDARD misses).
export const SENSOR_DROP_FACTOR_BY_BAND: Readonly<Record<Band, number>> = {
  ok: 1, degraded: 1.5, failing: 2.5, dead: 2.5, missing: 2.5,
};
// Nav Plotter's factor (§3.8), gentler than Sensor Interp's: Sensor Interp already greys the whole plot when it fails, so
// the plotter's hits read as "a bit sloppier", and only its death stops the drop. dead / missing are moot (NO DROP
// SOLUTION: drop.solution is false), so 1, never a silent widening of a dot nobody sees.
export const PLOTTER_DROP_FACTOR_BY_BAND: Readonly<Record<Band, number>> = {
  ok: 1, degraded: 1.25, failing: 1.5, dead: 1, missing: 1,
};
// A pod's driver's factor, by its integrity band (§3.8 table): a degraded driver still lands soft but wider, a failing
// one lands hard AND wide (×2), which is what makes ship 1's POD 02 worth its REPAIR. dead never launches; its 2.0 is
// for the DetailPanel's display only (it calls dropFactors for every driver, so the table must cover it).
export const DRIVER_DROP_FACTOR_BY_BAND: Readonly<Record<Exclude<Band, 'missing'>, number>> = {
  ok: 1, degraded: 1.5, failing: 2.0, dead: 2.0,
};
// Bay Ctrl's cadence between launches by band, tactical s (§3.4, C7's shape): ok is BAY_CADENCE_TAC (four pods in 6 s),
// degraded 2.7 and failing 4.0 cost a pod or two of a sure window, dead 10.0 is one pod per window (`BAY CTRL DEAD · ONE
// POD AT A TIME`), and missing is null: BAY OFFLINE, no launch at all (a ship file with no backup, risk 8).
export const BAY_CADENCE_BY_BAND: Readonly<Record<Band, number | null>> = {
  ok: BAY_CADENCE_TAC, degraded: 2.7, failing: 4.0, dead: 10.0, missing: null,
};
// A ship with no-go arcs has at least one within this many km of a bracket edge (§3.6, §3.15): close enough that a wide
// dot (a degraded Sensor Interp at 6,000 km reaches ±117 km) or a late launch can land in it, far enough that a healthy
// sure launch never does. validateLandingDef checks it, so slice 3's generator is held to it too.
export const NO_GO_NEAR_EDGE_KM = 150;
// L8 (DROP UNCERTAIN) shows when the next awaited window is at most this many tactical s away (§3.11): a minute is enough
// for a Sensor Interp REPAIR (a few s) and the walk back to the ship, and earlier it would nag through a long WAIT.
export const DROP_UNCERTAIN_LEAD_TAC = 60;
// The `THE DOT IS WIDE — REPAIR, or fly lower` lesson (§3.11, risk 14) stands in front of the first L9 for this many AI s:
// long enough to read twice, short enough that L9's own line (which LZ, which file) and its SKIP come back quickly.
export const DOT_WIDE_LESSON_SEC = 5;

// --- 1b ORBIT (owned by Track ORBIT): the DRAG line and decay, GO LOWER, the drop solver's domain --------------------

// The DRAG line sits at the sweet zone's lower edge (§3.7): ring.min + this share of the band. It IS SWEET_ZONE_FRAC on
// purpose, not a second number: phase-2 corrections aim for the sweet zone, so an ordinary lock sits on or above the line
// and never decays; going low is a choice (6,000 km on ship 1's band, 5,500 km on a 5,000–7,000 band).
export const DRAG_LINE_FRAC = SWEET_ZONE_FRAC;
// A drag kick's retrograde Δv at ▼ is this × (line − rp) / (line − ring.min), km/s (§3.7). 0.030: felt over a long
// landing (a circular 5,250 km orbit on a 5,000–7,000 band leaves the band after three orbits: kicks of 15, 22, 24 m/s),
// never ruinous (holding that orbit costs about 1% of a 2.1 km/s tank per orbit).
export const DRAG_DV_MAX_KMS = 0.030;
// At most one kick per this share of a period (plan §1.4): on a near-circular orbit ▼'s place is noise under CRUISE
// sub-stepping, and without a gap a ▼ that wobbles back and forth across a tick boundary would kick twice.
export const DRAG_KICK_MIN_GAP_FRAC = 0.5;
// A kick still owed after this many periods since the last one (▼ still below the line) is applied at once (plan §1.4):
// the catch-up for a ▼ the sampling stepped over, so decay never silently stops.
export const DRAG_KICK_CATCH_UP_FRAC = 1.5;
// The stamp (`DRAG · ▲ −110 km`), the hiss and the drag lesson show only for kicks that moved the far apsis at least this
// far (risk 15): a ▼ a few km under the line kicks under 1 m/s every orbit, and stamping that is noise. Physics stays
// continuous below it.
export const DRAG_STAMP_MIN_KM = 10;
// L10 (ORBIT DECAYING) and the 'lift' burn come up when decay takes ▼ out of the band within this many orbits (§3.7):
// about two SKIPs (≈ 12 real s), time to read the line and act, and late enough not to nag on a slow sink.
export const DECAY_WARN_ORBITS = 2;
// The 'lift' burn (risk 3) raises ▼ to the DRAG line plus this margin, km: a little above the line, so the next ▼ is
// clear of it and the kicks stop instead of starting again an orbit later.
export const DRAG_LIFT_MARGIN_KM = 50;
// The lift's HOLD (review fix 2, landing-rules liftHold: the low orbit GO LOWER flew to, kept in the band) burns only once
// ▼ or ▲ is this far under its mark, km: a release a few tenths of a second early or late leaves it within this, and a
// lift of a few km is not worth a TACTICAL pass (one kick under the DRAG line takes ▲ down by well over 100 km).
export const LIFT_HOLD_SLACK_KM = 20;
// GO LOWER (§3.7) aims for the radius where the awaited LZ's sure window lasts this many tactical s: three pods at the
// healthy cadence (2.0 s apart), the smallest window worth a burn.
export const LANDING_SURE_MIN_TAC = 4;
// ...but never takes ▼ closer than this to the band's floor, km (§3.7's "▼ is 100 km above the band floor"): the hard
// stop that keeps a late release (risk 1) inside the band.
export const GO_LOW_FLOOR_MARGIN_KM = 100;
// The drop solver's domain (risk 9): above this eccentricity the pod's kick can fail (steep paths) or the dot track
// stop being monotonic. 0.6 is far beyond any orbit the band holds (a 5,000–9,000 band's widest loop is e ≈ 0.29), so
// only a wild burn in landing leaves it: then there is no dot until the orbit is back (landing-orbit dropSolvable).
export const DROP_SOLVE_MAX_E = 0.6;
// The landing's burns run at this share of the flight's thrust (risk 1, the lead's decision; shown on the POWER slider is
// UI's). Measured (engine-landing.test's scripted kid, ARES-VII from a circular 8,950 km, an LZ 330 km wide, GO LOWER's
// target 7,096 km): at full thrust the launch point moves about 1,100 km per real second, so the spread between a 0.3 s
// and a 1.2 s release is about 1,000 km, and no single RELEASE lead lands both near the target. At 0.5 the spread is
// about 530 km and, with LANDING_RELEASE_LEAD_TAC below, both keep the band and a sure window of at least 4 s (4.01, 4.36).
// Raise it with Fran: §3.7's "one RETRO burn the strip times and releases" holds only at this power.
// A ghost burst in the landing runs at it too (review M2): at full push an unswapped VESPER's passive landing had ▼ under
// the planet 79–110 real s after the lock (seeds 1–3); at 0.5, 95–193 s, with the strip's SWAP row up 3 s after the first.
export const LANDING_BURN_POWER = 0.5;
// The `BELOW THE DRAG LINE THE ORBIT SINKS` lesson (§3.11, risk 14) stands this many AI s from the first kick that moved
// the far side DRAG_STAMP_MIN_KM, while ▼ is still below the line: the stamp's moment, read twice, then the landing's line.
export const DRAG_LESSON_SEC = 5;
// GO LOWER's RELEASE (landing-orbit goLowReleased) says RELEASE once the launch point's radius, projected this many
// tactical s ahead at its current rate, reaches the target (F6's rule with its own lead). Not F6's RELEASE_LEAD_TAC
// (0.7, centred between a 0.4 s and a 1.2 s kid): GO LOWER's target is a floor for the sure window, not a middle, and a
// release short of it costs the window it was for. With 0.7 a kid letting go 0.3 s after the word stopped 0.4 s of
// burning short (3.68 s of sure window at LANDING_BURN_POWER 0.5, 3.17 s at full); with 0.3 the quick kid stops on it
// (4.01 s) and a slow one (1.2 s) goes deeper, still in the band (4.36 s). The floor (GO_LOW_FLOOR_MARGIN_KM) stays the
// hard stop for a target that is the floor. The 'lift' burn's RELEASE (guidance liftRows: once the burn it still needs
// is this short) uses it too, for the same reason: its target (▼ over the DRAG line) is a floor, and with 0.7 a quick kid
// lifted ▲ only half way on a 1 s burn (decay.test).
export const LANDING_RELEASE_LEAD_TAC = 0.3;

// --- 1b UI (owned by Track UI): the views' numbers, appended below -----------------------------------------------------

// The GROUND TRACK's terrain rows (01-landing §4, slice 1b terrainStretches): the planet's ground is cut into stretches
// this many degrees wide (≈ 180 km on a 3,390 km planet), each in the terrain's main glyph or its second one, so a
// volcanic world reads `^^^ ··· ^^^` instead of one glyph everywhere. Six or so stretches cross the 3,000 km strip:
// variety the eye follows as it scrolls, never noise.
export const TERRAIN_STRETCH_DEG = 3;
// The share of those stretches drawn in the terrain's second glyph (VOLCANIC `·` between its `^`): a minority, so the
// world keeps its one character.
export const TERRAIN_ALT_SHARE = 0.35;
// The drag stamp's life on the NAV PLOT (`DRAG · ▲ −110 km`, §3.7), wall ms: long enough to read the number at a SKIP's
// speed (a kick lands once an orbit, a few real seconds apart), gone before the next.
export const DRAG_STAMP_MS = 2600;

// =====================================================================================================================
// --- Phase 3 slice 2: the calm opening (docs/phase3/04-threats.md §3.1–§3.10, 01-landing.md §3.8, 05-story.md §3.2;
// docs/phase3/impl/slice-2-plan.md §4). Three sub-blocks, each owned by one track: a track edits only its own.
// =====================================================================================================================

// --- 2 THREAT (owned by Track THREAT): beam seeds, TRACE, the boarding, the root's sizes --------------------------------

// Beam seeds before HOLLOW boards (04 §3.5, §3.17) run on SEEDS_ONLY_DEF (data/threats.ts): the first bite after this many
// AI s of calm flight (the clock stands still at TACTICAL, as phase 2's first seed waited for a calm flight), so a seed
// never bites under a burn's lines and the kid has the RM lesson's time to answer it. Phase 2's HALCYON woke at 30.
export const BEAM_SEED_FIRST_BITE_CALM_SEC = 30;
// Then a bite every 25 AI s: the WALLS stage's rhythm (phase 2's HALCYON), the pace HOLLOW keeps once it boards.
export const BEAM_SEED_BITE_EVERY_SEC = 25;
// 2.5 %/s: weaker than HOLLOW's own 3.5, so a seed is a tax, not a fight; the worst 2.5 × 2 = 5 (the multipliers never
// stack), and heal(8) 18.5 still beats 1.5 × 5 (validateHollowDef).
export const BEAM_SEED_DRAIN_PER_SEC = 2.5;
// The unpack lays a beam seed out right behind its target (04 §3.4): the file, this GAP, the seed, then a WALL of
// WALL_MIN_BLOCKS free before the next file, so it bites only the file the ECC line names. One block, as SEED_TOOL_GAP_BLOCKS:
// a GAP under a WALL, so it bites at its first bite, with a block between them so the seed reads as a separate thing.
export const SEED_GAP_TO_TARGET_BLOCKS = 1;
// Seeds per beam by link noise (04 §3.4's table): the chance of 0, 1, 2 and 3 seeds. Slice 2 reads it for KESTREL's later
// runs (noise 2) and for VESPER and LAST LIGHT (noise 0: none, risk 2); slice 3's hops read it for every beam.
export const BEAM_SEED_ODDS: Readonly<Record<LinkNoise, readonly [number, number, number, number]>> = {
  0: [1, 0, 0, 0],
  1: [0.6, 0.35, 0.05, 0],
  2: [0.25, 0.45, 0.25, 0.05],
  3: [0.05, 0.3, 0.4, 0.25],
};
// HOLLOW boards on the beam into a ship once TRACE reaches this (04 §3.7: "Three, and it finds you").
export const TRACE_BOARD_AT = 3;
// The TRACE meter's cells (04 §4: `TRACE ■■□`): as many as it takes to board, so a full meter means "it finds you"; more
// reports show as `■■■ +1`.
export const TRACE_CELLS = TRACE_BOARD_AT;
// HOLLOW never boards below this depth (04 §3.8), so depths 1–3 are calm and seeds: the first three ships teach the ship,
// the landing and rm before anything hunts the pods.
export const BOARD_MIN_DEPTH = 4;
// Every ship from this layer on has a root slot (slice-3a-plan §1.1 item 18, the slice-2 foundation note): HOLLOW may
// board on any beam from BOARD_MIN_DEPTH, and every hop moves out at least one layer, so a layer-k ship is at most depth
// k: layers 1–3 never reach depth 4, and any ship from layer 4 on may (data/ships.ts validateShipDef).
export const ROOT_SLOT_FROM_LAYER = 4;
// Beam seeds start at this depth (04 §3.1, §3.4: "no seeds before depth 3", decided): ships 1–2 are calm.
export const SEEDS_MIN_DEPTH = 3;
// The root before the final ship is its stage's plus the beam-born blocks it was fed, capped here (04 §3.7: cap 14, the
// HUNT stage's root): a sloppy kid meets a bigger HOLLOW, never one whose slot outgrows the bay's margin.
export const PRE_FINAL_ROOT_CAP = 14;
// The largest root a final ship's slot must hold (04 §3.10, §3.17): the FINALE's 16 plus a MERGE trace's 2 (slice 7).
// validatePodRacks checks the slot's rack can take it, so slice 7 needs no layout change.
export const FINAL_ROOT_MAX_BLOCKS = 18;
// A deleted seed says one line from 05 §3.5's pool at most this often per ship (04 §3.6): a voice, not a chorus.
export const SEED_WORDS_PER_SHIP = 1;
// The strip's `A SEED — no rm aboard` line (04 §3.5) waits this many AI s into a ship: a licence the ship gives at its
// start (KESTREL's DELETE, afterAiSec 0) is written on the flight's first ticks, and the line must never flash before it.
export const BEAM_SEED_NO_RM_AFTER_SEC = 1;

// --- 2 OPENING (owned by Track OPENING): driver arrival damage, the calm ships, the log -------------------------------

// Rolled driver arrival damage (01-landing §3.8, §3.15): drivers that sat for decades arrive DEGRADED, 55–79%: a wider
// dot and a REPAIR worth its charge, never a hard landing on its own (the failing band starts under 50).
export const DRIVER_ROLLED_MIN = 55;
export const DRIVER_ROLLED_MAX = 79;
// ceil(pods ÷ this) drivers arrive degraded: one on a 5-pod ship, three on 12, four on 16. Enough MIND work for a calm
// ship's coast, few enough that charge still covers the instruments.
export const DRIVER_ROLLED_PER_PODS = 5;
// From layer DRIVER_FAILING_FROM_LAYER one more driver arrives FAILING, 30–45%: it would land hard (half points), so the
// deep ships open with a real triage (01-landing §3.8: "plus one at 30–45% from layer 4").
export const DRIVER_FAILING_MIN = 30;
export const DRIVER_FAILING_MAX = 45;
export const DRIVER_FAILING_FROM_LAYER = 4;

// The landing lessons (01-landing §3.11), once a run each, on the strip from the landing's start until the first pod
// launches: `◆ PODS LAND WHERE THE DOT IS` (run 1's first landing) and `◆ 2 SITES · LZ-A 3, LZ-B 2 — don't overfill` (the
// run's first ship with two or more LZs). Long enough to read a short line twice, as DOT_WIDE_LESSON_SEC's 5; a little
// more, because each opens a new screen (the dot, the second bracket) the kid is still taking in.
export const LANDING_DOT_LESSON_SEC = 6;
export const LANDING_SPLIT_LESSON_SEC = 6;
// The run-1 SCAN lesson (`◇ A FILE YOU DIDN'T PACK — SCAN it`, slice-2-plan §3.1) steps aside after this many AI seconds
// on the strip: the beat is missable (05 §3.5), so it never holds the coast's WAIT line back for longer than a glance.
// Run 2+ gets the same seconds as a hint.
export const LOG_SCAN_ASK_SEC = 8;
// ...and it waits for POD 02 to be settled, or for this many AI seconds of the coast with no op running (the review's
// minor 10: a kid who never repairs POD 02 never met it). The hurt-driver lesson has the coast to itself first: 20 s
// reads its line twice and starts a REPAIR (the op running holds the SCAN line back), while ARES-VII's coast still has
// a long WAIT left for the glance.
export const LOG_SCAN_AFTER_COAST_SEC = 20;

// --- 2 UI (owned by Track UI): the TRACE meter, the chips, the boarding moment, the LOG READER -------------------------

// The boarding moment (04 §4, a signature moment): as the boot's 108% unpack is said, the root drops into the bay's slot
// with a shake as big as debris slamming a rack or the ship's first ghost burst (SHAKE_DEBRIS_PX, SHAKE_GHOST_FIRST_PX),
// and the screen tears as hard as the root's death did in phase 2: glitchBurst(0.6, 900).
export const SHAKE_BOARD_PX = 6;
export const BOARD_TEAR_LEVEL = 0.6;
export const BOARD_TEAR_MS = 900;
// The root's slab falling into its slot on the strip (HollowPainter): long enough to see it land after the white-out
// lifts, short enough to be over before the boot's next line.
export const BOARD_DROP_MS = 1100;
// A beam seed's thunk on the strip (HollowPainter, with the seedLand cue): a short drop and flash.
export const SEED_LAND_FX_MS = 700;
// The LOG READER types an entry the first time at this many characters a second (05 §4: "an entry types itself"): a
// little slower than the TERMINAL's lines, so a 3-line entry (≤ 210 characters) reads in about 5 s.
export const LOG_READER_CPS = 42;

// --- Phase 3 slice 3a GEN (owned by Track GEN): the arm, years, the beam's numbers, the generator --------------------
// (docs/phase3/02-map.md §3.1–§3.6; slice-3a-plan §4.2). Every rule is integer arithmetic with half-up rounding
// (Math.round on a positive number: slice-3a-plan §2.3's finding, so LAST LIGHT lands on 3020).

// The galaxy year a run starts in (02 §3.1: `UNIT-047 · YEAR 2300`): ARES-n's approach, the first ship's year.
export const RUN_START_YEAR = 2300;
// The beam's reach (02 §3.3): every one-layer hop (the longest is 45 LY) and most two-layer hops (31 of 42), never three
// layers (the shortest is 70 LY), so every route has 5–8 ships.
export const BEAM_RANGE_LY = 58;
// Playtest 1 (Fran's note 20, OPEN-DECISIONS 131): the beam has no link limit any more (it was round(146 − 1.1·d) blocks).
// The destination's room is the one limit: the charge crosses whole, and what the room cannot hold is its WON'T FIT.
// Transit hits are round(d / 7) (02 §3.3): phase 2's 3–6 hits on 22–36 LY, and a route's total hardly depends on how it
// is split.
export const TRANSIT_LY_PER_HIT = 7;
// ECC repairs one hit per 25 years of slack while the unit sleeps (02 §3.3): a ship reached 50 years early cancels 2 of
// about 4 hits; an ark reached just in time cancels few or none. It counts against the extras too.
export const ECC_YEARS_PER_HIT = 25;
// A world closer than this to one of 046.log's rings fails the arm check (02 §3.2, 05 §3.2): a ring is crossed exactly
// when a route enters a new layer. The arm passes with at least 9 LY to spare.
export const RING_CLEARANCE_LY = 5;
// The layer base years (02 §3.4): B1 = the start year, B(k+1) = B(k) + the axis gap (22 LY out of layer 1, then 25) +
// LAYER_SLACK(k). Big slack on the hops out of layers 2 and 3 makes a request from layers 1–3 reach the next ship almost
// always; the smaller slack beyond starts the planning at layer 4. Run 1: 2300, 2352, 2467, 2612, 2712, 2817, 2927.
export const LAYER_AXIS_GAP_FIRST_LY = 22;
export const LAYER_AXIS_GAP_LY = 25;
export const LAYER_SLACK: readonly number[] = [30, 90, 120, 75, 80, 85, 90];   // index k − 1: the hop out of layer k
// A ship's timing (02 §3.4): A = base + offset × LAYER_SLACK(layer − 1) + jitter. LATE 50/50; +0.5 of the slack (0.3 in
// layer 2, so a request from a late ship 2 still makes ship 3); jitter a whole number in ±4 so no two ships tie by rule.
export const LATE_CHANCE = 0.5;
export const LATE_OFFSET = 0.5;
export const LATE_OFFSET_LAYER2 = 0.3;
export const TIMING_JITTER_YEARS = 4;
// An ark approaches 12 years, plus 0–4, before the earliest moment any ship of the layer before could reach it (02 §3.4):
// unreachable by a one-layer hop, reachable by a long hop from two layers back. Measured from the real neighbours.
export const ARK_MARGIN_YEARS = 12;
export const ARK_MARGIN_EXTRA_YEARS = 4;
// One ark in every second layer, never two in adjacent layers (an ark one layer after another would be reachable from it).
export const ARK_PATTERNS: readonly (readonly number[])[] = [[3, 5, 7], [4, 6]];
// The final ship's year (02 §3.4): the latest A(S) + d over every ship that has it in range, plus 20, rounded up to a
// multiple of 5 (3020 on run 1): every in-range ship can reach it, with room for the years new ships add.
export const FINAL_MARGIN_YEARS = 20;
export const FINAL_YEAR_ROUND_TO = 5;
// Ship size (02 §3.4, 01 §3.16's 16-pod cap): light 3 + ⌊layer / 3⌋ (3–5), standard 3 + layer (5–10), ark
// round(2.2 × (4 + layer)) capped at 16 (15 in layer 3), the first ship 3, the final ship 16.
export const FIRST_SHIP_PODS = 3;
export const FINAL_SHIP_PODS = 16;
export const LIGHT_PODS_BASE = 3;
export const STANDARD_PODS_BASE = 3;
export const ARK_PODS_PER_LAYER = 2.2;
export const ARK_PODS_LAYER_OFFSET = 4;
export const MAX_SHIP_PODS = 16;
// A standard ship of this many pods or more is FULL (02 §3.4, 01 §3.16): smaller ships carry smaller computers.
export const FULL_FROM_PODS = 9;
// 40% light ships among the non-ark ships (the old mix; Bernoulli per slot, as the sim's fresh roll), and from layer 5
// on at most two light (TIGHT) ships per layer, so check 5 keeps a non-TIGHT way through every late layer.
export const LIGHT_SHARE = 0.4;
export const LATE_TIGHT_FROM_LAYER = 5;
export const MAX_LATE_TIGHT_PER_LAYER = 2;
// A fresh roll that fails the validity checks is rolled again, at most this many times, then it throws (fail loudly:
// the sim's first roll is valid 84.7% of the time, and none needed more than 5).
export const GEN_MAX_ATTEMPTS = 50;
// Extra modifiers per generated ship by layer (02 §3.5): none in layer 2, up to 1 in layers 3–5, up to 2 in layers 6–7.
// Index = layer; layers 0–1 are unused (the first ship is authored).
export const EXTRA_MODIFIERS_MAX_BY_LAYER: readonly number[] = [0, 0, 0, 1, 1, 1, 2, 2, 0];
// SENSOR DAMAGE (02 §3.5): Sensor Interp arrives at most this (KESTREL's 45: PATH UNCERTAIN on arrival).
export const SENSOR_DAMAGE_MAX_INTEGRITY = 45;
// Noise clouds (02 §3.3; slice-3a-plan risk 14): four per run (three of strength 1, one of 2), radius 8–12 LY, centres
// 45–167 LY from SOL along the arm's bend and at most 16 LY to either side of it, no two centres closer than 20 LY.
// Space weather a kid can see and avoid; the one thing rolled fresh each run.
// WHY 8–12 (the slice-3a review, the lead's call; GEN's lever): at 12–18 LY, measured over 150 arms (every reachable
// hop, 40 routes an arm; tests/unit/map/generator-stats prints the hop distribution as INFO), only 22% of reachable hops
// were CLEAN, 18% SEVERE, and 18% of depth-3 hops clean, so seeds rode almost every beam and a kid who left them had TRACE
// board HOLLOW on 39% of routes: noise was the norm, not a choice. At 8–12:
// CLEAN 40%, SEVERE 7%, depth-3 hops 36% clean, TRACE boarding 20% under "leave every seed" (still under the ~50% CLEAN
// past which a cloud would stop being something to route round).
export const NOISE_CLOUD_STRENGTHS: readonly (1 | 2)[] = [1, 1, 1, 2];
export const NOISE_CLOUD_R_MIN_LY = 8;
export const NOISE_CLOUD_R_MAX_LY = 12;
export const NOISE_CLOUD_SOL_MIN_LY = 45;
export const NOISE_CLOUD_SOL_MAX_LY = 167;
export const NOISE_CLOUD_LATERAL_LY = 16;
export const NOISE_CLOUD_MIN_GAP_LY = 20;
// A hop's noise is the clouds' strengths summed, capped here (CLEAN, LOW, NOISY, SEVERE: 04 §3.4's seed table).
export const LINK_NOISE_MAX = 3;
// The salvage-rack reservations' odds (02 §3.5): POOR site data 1 in 3 in layer 5, 1 in 2 in layers 6–7; a sleeping
// resident placed with chance 45% when none waits (a sleeper on the arm in about 60% of runs); a late corrupted resident
// reads `unknown` 1 time in 2.
export const POOR_SITE_ODDS_LAYER5 = 1 / 3;
export const POOR_SITE_ODDS_LATE = 1 / 2;
export const SLEEPER_CHANCE = 0.45;
export const HIDDEN_RESIDENT_ODDS = 1 / 2;
// --- 3a GEN, Track GEN's additions ---
// ENGINE FAULT (02 §3.5): Thrust Ctrl arrives at 31% (VESPER's, WP10/WP12: the ghost thrust's rate and strength were
// tuned against a failing controller at this number).
export const ENGINE_FAULT_THRUST_INTEGRITY = 31;
// The pod-rack rule (01 §3.16): a rack takes at most 7 drivers (56 of 64 blocks), so rack B keeps a WALL's worth of free
// blocks and two drivers are left to flank the root slot in rack C. The slot reads `P _2 S _1 P`: the root sits between a
// driver at GAP 2 and the lead family's driver at GAP 1, which is bitten first (04's L2 geometry, LAST LIGHT's POD 11/12).
export const POD_RACK_MAX_DRIVERS = 7;
export const ROOT_GAP_BEFORE_BLOCKS = 2;
export const ROOT_GAP_AFTER_BLOCKS = 1;
// The landing roller (01 §3.15): brackets are spread evenly round the rim from a rolled start, each nudged at most this
// many degrees (4 LZs are 90° apart, so ±20° keeps them far beyond LZ_MIN_GAP_DEG and their windows well apart).
export const LZ_CENTRE_JITTER_DEG = 20;
// A no-go arc (01 §3.6): 3–8° wide, its near edge 30–140 km from a bracket's edge (within NO_GO_NEAR_EDGE_KM, never
// touching it), so a wide or late dot is a real risk and a healthy sure launch is not.
export const NO_GO_WIDTH_MIN_DEG = 3;
export const NO_GO_WIDTH_MAX_DEG = 8;
export const NO_GO_EDGE_GAP_MIN_KM = 30;
export const NO_GO_EDGE_GAP_MAX_KM = 140;
// A noise cloud's centre is drawn again at most this many times before the roll throws (its spacing rule is loose: four
// centres along 120 LY of arm, 20 LY apart, almost always place in a few draws).
export const NOISE_CLOUD_MAX_DRAWS = 200;

// --- Phase 3 slice 3a DESK (owned by Track DESK): the DESK, the chart, the card, the PACKET's new rows -----------------
// (docs/phase3/02-map.md §3.10, §4; 01-landing §3.16's room bar). Foundation F2 opens the block.

// A reachable ship with less slack than this is URGENT on the chart (02 §4: a pulsing ring): a few years of drift or a
// detour and it is gone.
export const URGENT_SLACK_YEARS = 10;
// The opening beat (02 §4): each ship whose approach passed since the last desk fades to grey this long after the one
// before, with a soft falling tone, so the kid can count them (`2 SHIPS NOW OUT OF YOUR REACH`).
export const DESK_GREY_STEP_MS = 450;
// The boot's sleep line (`> ASLEEP IN KESTREL'S RECEIVER · 2378 → 2467 · 89 YEARS`) rolls its year for this long as it
// types (02 §4 step 2: about 1.5 s), with a soft tick ratchet: the years are felt, not just read.
export const SLEEP_YEAR_ROLL_MS = 1500;
// 046's written trail ends in a grey cross "past Calder" (05 §3.11): this many LY beyond the world along the trail's last
// leg, so the cross reads as lost on the way, not as a colony at Calder.
export const TRAIL_046_CROSS_PAST_LY = 6;
// A unit lost after its last ship founded a colony (abandoned at that desk, slice 3c review fix minor 8): its grey cross is
// drawn this many LY past that world along the trail's last leg, so the colony's mark stays readable beside it (the same
// distance as 046's cross, the one the kid has learned to read as "lost on the way").
export const TRAIL_CROSS_PAST_COLONY_LY = 6;
// The STAR CHART's drawing (components/desk/chart-draw.ts), in screen pixels so the chart reads the same at any zoom: a
// ship's square and an ark's (and the final ship's) bigger one (02 §4: "arks are bigger"); the margin round the arm, and
// the room kept right of the outermost nodes for their `NAME · colonists` labels.
export const CHART_NODE_PX = 9;
export const CHART_ARK_PX = 14;
export const CHART_PAD_PX = 22;
export const CHART_LABEL_ROOM_PX = 118;
// Faint stars along the arm's band (02 §4: "near-black space with faint arm stars"): enough to read as a sky, few enough
// that a node is never lost among them.
export const CHART_STARS = 240;
// The phone's chart scrolls along the arm at this scale (02 §4: the arm runs from SOL at the bottom to the final ship at
// the top): about the desktop's at 1280 wide, so labels stay apart; turned this far so the arm's 40° axis stands upright.
export const CHART_PHONE_PX_PER_LY = 5.2;
export const CHART_PORTRAIT_DEG = 50;
// A desktop's chart turns the arm 15° clockwise (its axis at 25° instead of 40°): the scale that fits a 1280 × 720 and a
// 1440 × 900 desk best while SOL stays at the lower left.
export const CHART_LANDSCAPE_DEG = -15;
// The ship card's bottom sheet on a phone peeks this much of its top block above SET COURSE until it is pulled up.
export const DESK_SHEET_PEEK_PX = 132;
// CONTROL's line on the first desk types at this speed (characters per second): CONTROL's radio pace, so the kid reads
// it as the same voice.
export const DESK_TYPE_CPS = 38;

// =====================================================================================================================
// --- Phase 3 slice 3b: the repository, deliveries and the INBOX (docs/phase3/02-map.md §3.8–§3.9, §4; 05-story.md
// §3.3–§3.5; 04-threats.md §3.3–§3.4; docs/phase3/impl/slice-3b-plan.md §4). Two sub-blocks, each owned by one track: a
// track edits only its own (BOOT_LINE_AT_SEC above stays the foundation's).
// =====================================================================================================================

// --- 3b REPO (owned by Track REPO): the delivery rule's numbers, delivery seeds, the recommendation, the patch ----------

// The chance a delivery carries a seed, by its hop's noise (04 §3.4: 0 / 10 / 25 / 40%), at most one seed per file, behind
// the file it rode with. The beam's own seed odds rise with noise the same way: a delivery is one more file on that beam.
// Never on a tool kind's first delivery (the lesson is never eaten), never into a calm ship, never on the patch.
export const DELIVERY_SEED_CHANCE: Readonly<Record<LinkNoise, number>> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.4 };
// The boot says at most this many `> DELIVERY:` lines (02 §4 step 6: one per file, oldest first); beyond it the rest fold
// into the last line, so a backlog adds at most 3 lines (3.9 s at the 1.3 s step) whatever its size. The longest possible
// boot (BOOT_LINE_MAX 18) then says its last line at 22.6 s; a typical arm boot with one delivery and new mail is 8–11
// lines (its last line at about 10–14 s), and the skip rules hold throughout.
export const DELIVERY_BOOT_LINES_MAX = 3;
// ARRIVAL CONTROL recommends REPAIR v2 once the unit has repaired this many times this run (02 §3.8's rule 5): by then
// REPAIR is the tool it leans on, and v2's double heal pays for its 2 blocks.
export const REPO_RECOMMEND_REPAIRS_MIN = 5;
// The Swap rule looks this many layers ahead for an ENGINE FAULT ship the unit can reach (02 §3.8's rule 3: "within two
// layers"), and the Cp rule as far for HOLLOW. Slice 3b review (item 1, the lead's decision): 3, the lever plan risk 1
// named. Over 200 fresh arms following the tag (.tmp/rv3b/swap.ts), ENGINE FAULT ships were reached without Swap 30 times
// of 37 at 2; at 3 with the first desk's Swap form (runs 2+) and Mv re-tagged later, 7 of 37, with no more ships at
// depth 3+ without rm (16 of 841 either way) and 7 of 91 debris ships without Mv (from 0).
export const REPO_SWAP_LOOKAHEAD_LAYERS = 3;
// The REPAIR v2 patch's size (02 §3.8's catalogue): it presses on the link and the room like a small tool, so asking for
// v2 still costs something on a tight hop, but less than the 4-block Repair.bak it competes with.
export const REPAIR_PATCH_BLOCKS = 2;

// --- 3b UI (owned by Track UI): the INBOX's numbers, the desk tabs, the boot words ------------------------------------

// ARRIVAL CONTROL's broadcasts (the welcome, the policy reminders, the arm-complete letter) leave Earth this many years
// before the run's start year: 05 §3.12's welcome is SENT 2280 for a run that starts in 2300 (sent with the beam).
export const WELCOME_SENT_BEFORE_START_YEARS = 20;
// A colony writes at these colony years (05 §3.3): the first-week letter, the same colonist grown old, and the colony
// itself two centuries on. Each arrives by light at the first of the unit's ships far enough out in time.
export const POSTCARD_COLONY_YEARS: readonly number[] = [1, 50, 200];
// A message's body has at most this many lines (05 §3.3's rule): the reader shows a whole message without scrolling at
// 1280 × 720 and on a phone.
export const INBOX_BODY_MAX_LINES = 6;
// A colony's year-200 card counts this many people per colonist who landed (a placeholder growth for 05's words: a few
// doublings in two centuries; 05 §3.12's epilogue has RIVERSIDE at 120,000 after 760 years from 600).
export const POSTCARD_PEOPLE_PER_COLONIST_Y200 = 20;
// A postcard names its writer's age (`I'm 12 now`: the age at landing plus the colony's years, slice 3b review m6) up to
// this age; the year-50 card of a writer who landed old leaves the age out (a 61-year-old at landing would be 111).
export const POSTCARD_AGE_SHOWN_MAX = 99;
// A reply read this many ships or more after the ship it answers greets the unit before you (05 §3.4's running joke,
// made deterministic: `Dear Unit 46` on run 1). One ship later is the norm near Earth; two is CONTROL falling behind.
export const REPLY_STALE_AFTER_SHIPS = 2;
// The sleep line's year roll (SLEEP_YEAR_ROLL_MS, 02 §4 step 2) ticks a soft ratchet once per this many years: a hop's
// 20–160 years read as 4–30 ticks over the 1.5 s, a ratchet and never a buzz.
export const SLEEP_YEAR_TICK_YEARS = 5;

// --- Phase 3 slice 3c: the save, archive v2 and the world update between runs (docs/phase3/impl/slice-3c-plan.md §4.1;
// 02-map.md §3.1, §3.11–§3.13). The foundation laid these blocks down; each track adds only inside its own. ---------------

// --- 3c WORLD (owned by Track WORLD): the world update's numbers, cross-checked against docs/phase3/map-sim/arm_sim.py ---

// The launch gap (02 §3.1 = the sim's GAP_TABLE): [years, chance], the chances summing to 1. The next unit sets out this
// many years after the last: mostly a year or two (it was following you all along), now and then long enough that the arm
// moved on. Mean 2.785, median 2 (the sim's runs: 2.69–2.81).
export const LAUNCH_GAP_TABLE: readonly (readonly [number, number])[] = [
  [0, 0.10], [1, 0.35], [2, 0.25], [3, 0.12], [5, 0.10], [10, 0.06], [20, 0.015], [35, 0.005],
];
// A waiting ship more than this many years off the next run's schedule (next start − the start it was timed against,
// strictly greater) leaves, final ships included (02 §3.12 step 2): it keeps every waiting ship inside the margins the
// timing rules were built with (jitter ±4, ark margin 12), so a gap over 10 years clears the arm.
export const DRIFT_LIMIT_YEARS = 10;
// The time valve (02 §3.12 step 6): an updated arm whose best route is below the fresh roll's 1st percentile (63 pods,
// the TIGHT cost not counted, as the sim scores it) gets this many more years, so every waiting ship drifts off and the next
// arm is a fresh roll around the final ship. Never opened in the sim's 12,000 runs.
export const VALVE_FLOOR_PODS = 63;
export const VALVE_YEARS = 11;
// A ship leaves after its 3rd run on the chart (runsOnChart > 3 after the update's increment; the sim's age >= MAX_AGE with
// age from 0): some turnover makes the same arm feel new, and nobody's skipped ship sits there forever.
export const MAX_RUNS_ON_CHART = 3;
// Each other generated ship leaves with this chance (02 §3.12 step 2; authored ships are exempt, as in the sim), and of
// those, this share says `ANOTHER CORE IS ON ITS WAY` (else `IT WILL COME IN ON ITS OWN`).
export const RESOLVE_CHANCE = 0.2;
export const RESOLVE_CORE_SHARE = 0.5;
// A new final ship comes no earlier than the last final ship's year plus max(gap, this) (02 §3.4's floor): the ending never
// moves earlier for a later unit.
export const FINAL_FLOOR_MIN_GAP_YEARS = 1;
// The update's repairs (the sim's): from this attempt a waiting ship that is part of a check failure leaves; from the
// second, a planned slot with no predecessor retires a feeder too. Until then only the new ships re-roll.
export const UPDATE_REPAIR_FROM_ATTEMPT = 5;
export const UPDATE_FEEDER_FROM_ATTEMPT = 10;
// Archive v2's history caps: colonies kept per world (about 1,000 over 200 runs otherwise: the archive stays small), the
// last runs' routes (02 §3.12: three, for faint trails) and the notable events of the last run (05 §3.8: four).
export const COLONY_HISTORY_MAX_PER_WORLD = 8;
export const ROUTE_HISTORY_RUNS = 3;
export const NOTABLE_EVENTS_MAX = 4;

// --- 3c SAVE (owned by Track SAVE): the run save's and the archive's keys and versions ----------------------------------

// The run save (02 §3.11): its own key beside the archive's, so a bad save never takes the archive with it. The key stays
// for good; the envelope's version moves, and an older save is migrated in place (systems/save-codec.ts migrateRunSave),
// so a new field never strands a save in flight. A version this build can't migrate is refused loudly (RUN SAVE CAN'T
// RESUME), never reinterpreted.
export const RUN_SAVE_KEY = 'arrival-protocol/run/v1';
// 2 (slice 4): run.skills replaces skillTrainedOn, run.stats.dropDemos, burn.auto's mode fields, arrival.skills, skill files'
// version and lock (save-codec RUN_SAVE_MIGRATIONS[1]).
// 3 (slice 4 review): burn.auto keeps the burn in hand and whether it captured (`flying`, `captured`), so 4c can save inside a
// flight or a landing (RUN_SAVE_MIGRATIONS[2]).
// 4 (slices 4c–4e, one bump for the three: slice-4cde-plan R1): landing.autodrop, burn.auto.holding,
// hollow.seedTelegraph.preempted, arrival.seeds[].disguise and run.threat.seedsMetAtDepth (RUN_SAVE_MIGRATIONS[3]).
// 5 (slice 5, one bump for the three tracks: slice-5-plan R1): run.residents, the ship slice `resident`, the residents' five
// segment types, DriverSegment.lockedBy and a nullable LogChoice.timeoutAiSec (RUN_SAVE_MIGRATIONS[4]).
// 6 (slice 6, one bump for the two tracks: slice-6-plan R1): landing.survey and landing.sitesRev, LzState.site and the widened
// LzGround, run.ships[].survey (RUN_SAVE_MIGRATIONS[5]).
// 7 (slice 7a, one bump for its three tracks and 7b: slice-7-plan R2): the FINALE's two steps (hollow.finale v7),
// landing.lastLanding (7b's, always null), FeaturedColonist.line, run.lastUnit.ending (RUN_SAVE_MIGRATIONS[6]).
// 8 (slice 7c, one bump for its three tracks: slice-7-plan R2, §2.2): run.traces, run.log.book, arrival.traceLines
// (RUN_SAVE_MIGRATIONS[7]).
// 9 (slice 7d, one bump: slice-7-plan R2, §2.2 7d): SignalRecord.source and .n (signals beyond the notes), the `▓▓░▓`
// signal file (SegmentType 'signal') (RUN_SAVE_MIGRATIONS[8]).
// 10 (playtest 1, Batch B's one bump, B-ORDER's: plan §3.3.3): the link fields gone (Hop.linkBlocks; note 20), run.leave
// and phase 'leave' at SHIP DONE (LEAVE ORBIT before the desk; note 5), the resume line's stage, AUTODROP's `held` and its
// end 'released' gone (B-DROP's v1 arm; note 9) (RUN_SAVE_MIGRATIONS[9]).
export const RUN_SAVE_VERSION = 10;
// The archive (§4.5; 02 §3.12: v2 holds the arm, the trail, colonies, routes, events and traces). From slice 3c the key
// stays `meta/v2` and versions migrate in place (systems/meta.ts migrateMeta, META_VERSION the record's); a new key is
// only ever a deliberate reset. v1's key (phase 2's archive) was the one such reset: never written, read only to detect it
// (the title says once that an older archive was not carried over).
export const META_STORAGE_KEY = 'arrival-protocol/meta/v2';
export const META_V1_KEY = 'arrival-protocol/meta/v1';
// 3 (Track SAVE): `mergeBonus` retired (plan risk 3); a version-2 record (the foundation's) migrates in place.
// 4 (slice 7a, slice-7-plan R3, R16): lastUnit.ending (the ending record), endingsSeen widened to the seven pieces, `traces`
// dropped (a trace lasts one run: the last unit's ending is the next run's traces).
export const META_VERSION = 4;
// The save suites print a world point's size, INFO only, against this (3c plan risk 8: an estimated 150–250 KB, the log
// the largest part; past it the lever is keeping only the last TERMINAL entries).
export const SAVE_SIZE_INFO_BYTES = 400_000;

// --- 3c UI (owned by Track UI): the chart's trail markers and the departures block ---------------------------------------

// A trail marker at a world that also holds a REPORTED HOME ship is drawn this far along the trail from the node (3c plan
// risk 10), so the marker and the live node never sit on each other. Track UI: 13, so the 6 px mark clears an ark's or the
// final ship's 14 px square (half 7 + half 3) with a 3 px gap; the old 10 put the mark on an ark's edge.
export const TAKEN_MARK_OFFSET_PX = 13;
// The opening desk's departures block lists at most this many ships (the rest fold into `+n MORE`): it must not push the
// chart off a 1280 × 720 screen.
export const LEAVE_BLOCK_MAX_LINES = 6;
// The title's launch line from run 2 rolls its year (and the gap) up from the last unit's start, then lands its stamp: it
// waits this long after the title shows (the chart fading in first), and rolls over this long (a 35-year gap still reads as
// years ticking, not a blur), then the stamp lands this long after the last year.
export const TITLE_LAUNCH_ROLL_DELAY_SEC = 0.7;
export const TITLE_LAUNCH_ROLL_SEC = 1.4;
export const TITLE_LAUNCH_STAMP_AFTER_SEC = 0.25;

// --- 4 TREE (owned by Track TREE): training cycles, the bank and the tree's rules (03 §3.1–§3.4) -------------------------

// Training cycles per ship (03 §3.1): 1 + floor(5 × points ÷ colonists aboard). ARRIVED pays 1 even on a crash, so a bad
// ship never means no skills and so more bad ships (no death spiral); LANDED pays one more for every full 20%, five steps a
// kid can read off the LANDING REPORT, the fifth needing every point (`PERFECT LANDING · +6`). run-score.ts shipCycles.
export const CYCLES_ARRIVED = 1;
export const CYCLES_PER_STEP_PCT = 20;
export const CYCLES_LANDED_STEPS = 5;
// The first-pick guarantee (03 §3.1, signed off): the run's first desk raises the bank to this if it is lower (ship 1
// crashed: 1 earned, +2), so the required first pick can always buy a root (every root costs 3).
export const FIRST_PICK_FLOOR_CYCLES = 3;
// RESTORE (decision 16): a lost skill comes back for half of what its lost levels cost, rounded up. Losing hurts (the
// spec's AUTODROP v3: 8 of 16), but never as much as buying it again, so a long hop or a TIGHT ship is a price, not a trap.
export const RESTORE_FRACTION = 0.5;
// The largest skill file (03 §3.4): AUTOBURN v3 with LOCK 810, 10 + 2. A repair started before zero must still win (§6.6):
// REPAIR v1 heals 100 ÷ (3 + 0.3 × 12) = 15.2 %/s, above 1.5 × the worst drain (5 %/s × 2 = 10, so 15); at 14 blocks it
// would be 13.9 and the rule would break. data/skills.ts checks the table and the rule at load.
export const SKILL_MAX_BLOCKS = 12;
// The `+2 CYCLES` salvage card (02 §3.10): about half a ship's pay for skipping a file or charge, so it is a real choice
// against FIREWALL or +12 CHARGE without buying a v2 outright. Never dealt into the final ship (no desk follows: plan §7
// R12).
export const CYCLES_CARD_CYCLES = 2;

// --- 4 FLIGHT (owned by Track FLIGHT; it edits values only in this block): AUTOBURN v1–v3's flying (03 §3.6–§3.7) -------

// LOCK RANGE (03 §3.7), by LockLevel: AUTO is offered while the mode's first burn is at most this many tactical seconds
// away. 90 is phase 2's window (it comes with v1); 270 and 810 each triple it, so one [F] SKIP can carry an armed coast.
export const LOCK_RANGE_TAC: readonly [number, number, number] = [90, 270, 810];
// An armed AUTOBURN claims its Core thread this many tactical seconds before its burn (03 §3.7): the TACTICAL lead, so the
// claim lands when the world slows down for the burn anyway, and no thread is held while it only waits. Equal to
// TACTICAL_LEAD_BURN_TAC (data/skills.ts checks it).
export const AUTO_THREAD_CLAIM_TAC = 8;
// ...and lets it go again (or stops waiting for one) once the burn it claimed for is this far off again: a wait that
// outlasted a trim's apsis leaves the plan's next burn a loop away (slice 4 review M1). Twice the claim lead, so a START
// BURN that jitters across the window's edge does not claim and release the thread tick by tick.
export const AUTO_THREAD_RELEASE_TAC = 2 * AUTO_THREAD_CLAIM_TAC;
// AUTOBURN never plans a trim, a ROUND burn or (4e) a landing-orbit burn that would leave less FUEL than this (03 §3.6):
// `GREEN, NOT ROUND — SAVING FUEL`. Never the capture (plan §7 R4): refusing it would leave the kid the same burn by hand.
export const AUTO_FUEL_RESERVE_PCT = 20;
// ROUND (03 §3.6, decision 15) is done below this eccentricity: the drop width is then the same on every pass.
export const ROUND_E_TOL = 0.01;
// ROUND aims for half the tolerance (a circle within ROUND_E_TOL × R* of R*, and e below this): a finite burn spread
// around its apsis and the 10 Hz plot never stop exactly on the aim, and an orbit that ends a hair under 0.01 would
// read "not round" again after one drag kick. The stop itself is the ship's exact state, so the margin is never spent.
export const ROUND_AIM_E = ROUND_E_TOL / 2;

// =====================================================================================================================
// --- Phase 3 slices 4c–4e (docs/phase3/impl/slice-4cde-plan.md §2.6). The FOUNDATION wrote every number below; each
// track edits values only in its own block (4c DROP, 4d SENTRY, 4e ORBIT), and a new number goes at the end of its
// own block. The blocks are kept apart by these banners so that the three tracks' hunks never touch.
// =====================================================================================================================

// --- 4c AUTODROP (owned by Track DROP; it edits values only in this block): AUTODROP v1–v3 (03 §3.3, §3.8) ------------

// AUTODROP learns from the kid's own launches (03 §3.3; systems/skill-tree.ts AUTODROP_DEMO_TUNING): half the mean offset
// of the last AUTO_DEMO_WINDOW drops (the share AUTOBURN learns too, so "trained by you" means the same on both skills),
// clamped to ±1 tac s: half the healthy bay's 2.0 s cadence, so a learned skill never shifts a volley by a whole slot.
export const AUTODROP_OFFSET_FACTOR = 0.5;
export const AUTODROP_OFFSET_MAX_TAC = 1.0;
// AIM (03 §3.3, §6: `AIM 91%`) is 100 − 40 per tactical second of that offset, within 40..99: at the clamp (±1 s) a sloppy
// teacher still leaves AIM 60, and only an untrained skill reads the floor.
export const AUTODROP_AIM_PER_TAC = 40;
export const AUTODROP_AIM_MIN = 40;
export const AUTODROP_AIM_MAX = 99;
// An AUTODROP bought before any manual launch is UNTRAINED (03 §3.3: 40%; plan R5): read through the AIM rule, 40% is an
// offset of (100 − 40) ÷ 40 = 1.5 tac s, so it fires that late. The ±1 clamp applies only to what demos teach; at offset 0
// an untrained skill would be perfect, and buying it without one manual drop would be the best AUTODROP.
export const AUTODROP_UNTRAINED_OFFSET_TAC = 1.5;
// A volley straddles the window's centre (plan R6): its first launch is centre − (n − 1) × cadence × this, each later one a
// cadence on. Half of the cadence Bay Ctrl gives NOW (2.0 healthy, 2.7 degraded, 4.0 failing), so a damaged bay's volley is
// still centred instead of overrunning the bracket's far edge.
export const AUTODROP_SPACING_FRAC = 0.5;
// v2 and v3 claim a Core thread this many tactical seconds before a volley's first launch (plan R8: "hack or drop"). The
// TACTICAL lead, as AUTOBURN's claim: the world goes TACTICAL there anyway, so the claim never costs a thread at CRUISE.
// Equal to WINDOW_TACTICAL_LEAD_TAC (data/skills.ts checks it at load).
export const AUTODROP_CLAIM_TAC = AUTO_THREAD_CLAIM_TAC;
// v3's plan table looks this many passes ahead (03 §3.8): a 16-pod ark at two pods a pass on its worst LZ. Past it the
// table says `+n PASSES` rather than growing past the POD BAY window.
export const AUTODROP_PLAN_MAX_PASSES = 8;
// `PASS DONE · A +2 · B +1` stands on the strip as long as AUTOBURN's hand-backs do: one length for "the skill is done".
export const AUTODROP_DONE_LINE_SEC = AUTOBURN_DONE_LINE_SEC;
// Track DROP: a volley's last slot sits this many tactical s inside the sure part's close. The controller is asked once an
// AI tick (0.05 tac s at TACTICAL ×20, a quarter of that under OVERCLOCK) and launches up to a tick after its slot, and the
// drop solution it times by is up to a refresh (0.1 tac s) old: two ticks of margin keep the last pod's dot inside.
export const AUTODROP_EDGE_MARGIN_TAC = 0.1;
// Track DROP: a claimed thread is let go once the next volley is more than AUTODROP_CLAIM_TAC + this away (plan R8: one
// thread per window, none between). The margin keeps a volley whose first slot jitters across the claim's edge (the drop
// solution re-solves at 10 Hz) from claiming and releasing tick by tick; a double window (two LZs within 40° of arc, 01
// §3.4) keeps its one thread across the gap.
export const AUTODROP_RELEASE_MARGIN_TAC = 2;
// Track DROP: the warning alert `AUTODROP.skl DAMAGED — DROP BY HAND` stands this long (AI s), as long as PASS DONE does:
// no crash follows a dead AUTODROP (plan §3.1), so it warns without the klaxon and goes.
export const AUTODROP_DAMAGED_ALERT_SEC = AUTODROP_DONE_LINE_SEC;

// --- end of 4c AUTODROP --------------------------------------------------------------------------------------------------

// --- 4d SENTRY (owned by Track SENTRY; it edits values only in this block): disguised seeds, SENTRY v1–v3 (03 §3.10) --

// A beam seed lands disguised as a harmless 2-block file (04 §3.6, decision 22) with this chance, by the receiver's depth:
// the first row whose fromDepth is at most the depth counts (read from the last). Before depth 5 the kid is still learning
// what a seed looks like; from 7 the arm is HOLLOW's, and two of its seeds in three hide. Noise seeds on the beam only (plan
// R9). Slice 8 (§2.4, OD 4): raised from 1/3 and 1/2 (decision 22's starting values), because a depth-5 run met a decoy in
// only 25% of runs (balance/decoy-stats, 800 runs); now 33%. The rate alone can't reach 40% (3/4 and 1 give 43%, with
// nearly every deep seed hidden), so SENTRY v1's price is §2.4's other half (ECONOMY's). To reverse: 1/3 and 1/2.
export const DISGUISE_CHANCE_BY_DEPTH: readonly Readonly<{ fromDepth: number; chance: number }>[] = [
  { fromDepth: 5, chance: 1 / 2 },
  { fromDepth: 7, chance: 2 / 3 },
];
// SENTRY v2's QUICK RM (03 §3.10): DELETE on a hollow block that is not the root takes this share of its time, so a seed
// goes in 1.0 s instead of 2.0, and a 6-block meal in 2.0 s instead of 4.0. The root's ROOT_DELETE_SEC is untouched (plan
// R10): the duel's length is the finale's design, not one 3-cycle purchase's.
export const SENTRY_DELETE_FACTOR = 0.5;
// SENTRY v3's FIREWALL (03 §3.10): one fresh FIREWALL.sys compiled at each boot while the unit holds fewer than
// FIREWALL_MAX_OWNED (2), so the skill tops the unit up but never stacks walls past what the salvage cards allow.
export const SENTRY_FIREWALLS_PER_BOOT = 1;
// The version each of SENTRY's powers needs, as it works now (graded damage, 03 §3.5: v3 at 64% works as v2, so it compiles
// no FIREWALL but still rm's quickly). The tree's order (data/skills.ts SKILL_TREE.sentry: SIGHT, QUICK RM, FIREWALL), named
// so the rule code never compares against a bare 2.
export const SENTRY_SIGHT_VERSION = 1;
export const SENTRY_QUICK_RM_VERSION = 2;
export const SENTRY_FIREWALL_VERSION = 3;

// --- end of 4d SENTRY ----------------------------------------------------------------------------------------------------

// --- 4e ORBIT (owned by Track ORBIT; it edits values only in this block): AUTOBURN v3 LANDING ORBIT (03 §3.6) ---------

// v3 tries round orbits from the top of the band down in steps of this (03 §3.6; plan R12): a target on a 100 km grid is
// readable on the plot (`6,100 km`) and does not twitch while a drop factor drifts, as a bisection's would.
export const V3_STEP_KM = 100;
// The hold's slack (plan §2.6): a top-up comes once ▼ or ▲ sinks one grid step under R*, about every one or two orbits
// under the DRAG line (01 §3.7's kicks of 15–24 m/s). So the hold costs about 01's 1% of the tank per orbit, in a few
// burns instead of one a pass.
export const V3_HOLD_SLACK_KM = V3_STEP_KM;
// The lowest circle v3 tries: the same hard floor above the band's bottom as the kid's GO LOWER (one rule for "too low").
export const V3_FLOOR_MARGIN_KM = GO_LOW_FLOOR_MARGIN_KM;
// v3's fuel line reuses AUTO_FUEL_RESERVE_PCT (20): one reserve for every AUTOBURN mode.
// Which of the circles that fit best v3 takes while they are above the DRAG line (slice 4c–4e review M5, the lead's call;
// Fran is told with the numbers and may reverse it): `nearest`, the one the transfer from the loop costs least, or
// `highest`, 03 §3.6's literal rule. WHY nearest: 03 says the highest because it decays least, but above the DRAG line
// nothing decays, so the climb bought nothing. Over the five classic ships from a low ellipse, healthy, the climb cost
// −25.4% FUEL against −6.5% for the nearest (v2 ROUND −7.6%), with the same pods landed and the same first drop, and the
// landing orbit reached up to twice as soon (VESPER 117 → 63 s, LAST LIGHT 337 → 158 s). Below the line the highest stands
// (it decays least), as do aims with no circle above it.
export const V3_AIM_ABOVE_DRAG: 'nearest' | 'highest' = 'nearest';
// A loop rounder than this has no apsis to burn at (slice 4c–4e review m2): its ▼ and ▲ are numerical noise that moves
// every tick, so a circle burn planned at them never comes (from an exactly circular lock v3's first burn read `▲ in 0:15`
// for 176 wall s). Under it the circle planner burns at the next quarter turn instead (predict planToCircle), a fixed
// point in space. In play ROUND stops at e ≈ 0.0045 and drag keeps e far above this; the harness's e = 0 lock is the case.
export const CIRCLE_NO_APSIS_E = 1e-5;

// --- end of 4e ORBIT -----------------------------------------------------------------------------------------------------

// =====================================================================================================================
// --- Phase 3 slice 5, resident AIs (docs/phase3/impl/slice-5-plan.md §2.6). The FOUNDATION wrote every number below; each
// track edits values only in its own block (5 WARDEN, 5 KIN, 5 FACE), and a new number goes at the end of its own block.
// The blocks are kept apart by these banners so that the three tracks' hunks never touch.
// =====================================================================================================================

// The lead's: a resident's files need this many free blocks in rack A (04 §3.11's L6: the largest kind, MOTH.sys and its
// lock, 13 blocks, with a block to spare). RACK_A keeps 18 free on every class (data/memory.ts checks it against this at
// load), so a resident may sit on any class; data/residents.ts residentRackA throws on a rack A with less.
export const RESIDENT_RACK_A_MIN_FREE = 14;
// The year run 1's ships launched from SOL with their own AIs (05 §3.6: `aboard since 2240`, the sleeper's years asleep): 60
// years before run 1's start, so a run-1 arm ship's resident has been aboard about a lifetime. A ship a later run rolled
// launched as much later as that run started (systems/map-run.ts shipLaunchYear; review m7).
export const RUN1_SHIP_LAUNCH_YEAR = 2240;




// --- 5 WARDEN (owned by Track WARDEN; it edits values only in this block): the corrupted resident (04 §3.12) -----------

// WARDEN.sys (04 §3.12): 10 blocks at 40%. REPAIR to 100 costs 60 × 10 × 0.02 = 12 charge in 60 ÷ (100 ÷ (3.0 + 3.0)) =
// 3.6 s: 04's "about one bite fight", against a 6 s DELETE.
export const RESIDENT_FILE_BLOCKS = 10;
export const RESIDENT_START_INTEGRITY = 40;
// HOLLOW's per-block DELETE (DELETE_HOLLOW_BASE_SEC, DELETE_HOLLOW_PER_BLOCK_SEC): 6.0 s for 10 blocks. It is cut out like
// something that grew there, not deleted like a file.
export const RESIDENT_DELETE_BASE_SEC = 1.0;
export const RESIDENT_DELETE_PER_BLOCK_SEC = 0.5;
// The engine bursts (plan R3, [FRAN]): 04's 14 tac s and 1 tac s, at amp 0.10 instead of 04's 25%. Its push (0.10 ÷ 14 =
// 0.0071 per tac s) is 48% of the arm's failing controller (0.015): about half an unfixed VESPER. capabilities.ts checks it
// stays under the failing controller's. Slice 8 (§2.5, OD 24): down from slice 5's 0.15 (the arm's limp amp, 71%), at which
// an ignored resident stranded 3 of 10 flights (GANNET, seeds 3–11, strip and sloppy kids) at 0% FUEL; at 0.10 every ignored
// flight locks its orbit (FUEL 2% mean, 18 points under no resident), and every answer lands within 2 points of no resident.
// The intervals stay, so anger still doubles the rate. To reverse: amp 0.15 (0.07 would leave 5% FUEL in 8 of 10 ignored
// flights, but only 6 points of pressure; slice-8-plan "Deviations (Track THREAT)").
export const RESIDENT_GHOST: Readonly<GhostSpec> = { meanIntervalTac: 14, amp: 0.10, durTac: 1.0, stickChance: 0 };
// While a DELETE runs on it (04: "a burst every 4 tac s meanwhile"): the 6 s DELETE costs about 1.5 bursts, so it is felt,
// but never a reason not to.
export const RESIDENT_GHOST_DELETING: Readonly<GhostSpec> = { meanIntervalTac: 4, amp: 0.10, durTac: 1.0, stickChance: 0 };
// After REFUSE or a timeout (04 §3.12): twice as often, for RESIDENT_ANGRY_SEC.
export const RESIDENT_GHOST_ANGRY: Readonly<GhostSpec> = { meanIntervalTac: 7, amp: 0.10, durTac: 1.0, stickChance: 0 };
export const RESIDENT_ANGRY_SEC = 30;
// The locks (04 §3.12): phase 2's verb drill. The first 30 AI s after the wake, then every 40 (room for the flight between
// them), each telegraphed for 3 s.
export const RESIDENT_LOCK_FIRST_SEC = 30;
export const RESIDENT_LOCK_EVERY_SEC = 40;
export const RESIDENT_LOCK_TELEGRAPH_SEC = 3;
// At most ceil(pods ÷ 4) locks a ship, never more than 3 (04 §3.12): a TIGHT ship (at most 8 pods) gets 2.
export const RESIDENT_LOCK_PODS_PER = 4;
export const RESIDENT_LOCK_MAX = 3;
// An angry resident's lock interval (04 §3.12: 0.6 × the interval).
export const RESIDENT_ANGRY_LOCK_FACTOR = 0.6;
// The late surprise's grace (04 §3.12): it wakes 20 AI s into calm flight, and its first lock comes at 45 instead of 30.
export const SURPRISE_WAKE_SEC = 20;
export const SURPRISE_FIRST_LOCK_SEC = 45;
// The share of a looping line's characters drawn as `▓` (05 §3.12): enough to read as failing (like a degraded AI Comms),
// little enough that every line stays readable.
export const RESIDENT_GARBLE = 0.15;
// Its looping lines come at its bursts, but never within this many AI s of its last line of any kind: at CRUISE the bursts
// come every few seconds of wall time (the scheduler runs on game time), and a line at each one buried the TERMINAL.
export const RESIDENT_LINE_EVERY_SEC = 20;
// The resident's DEAL reuses DEAL_TIMEOUT_SEC (15): both deals give the same time to read and decide.

// --- end of 5 WARDEN -----------------------------------------------------------------------------------------------------




// --- 5 KIN (owned by Track KIN; it edits values only in this block): the residents that left and the sleeper (04 §3.13–14)

// A departed resident's files (04 §3.13): a 1-block note and three leftovers of 2–4 blocks. At most 13 blocks, so rack A
// keeps at least 5 free (a WALL's width and one).
export const NOTE_BLOCKS = 1;
export const LEFTOVER_COUNT = 3;
export const LEFTOVER_BLOCKS_MIN = 2;
export const LEFTOVER_BLOCKS_MAX = 4;
// They wait, untouched, until something eats them.
export const LEFTOVER_START_INTEGRITY = 100;
// The sleeper (04 §3.14): MOVE takes 1.5 + 0.2 × 12 = 3.9 s, and rm on its lock 1.0 s.
export const SLEEPER_FILE_BLOCKS = 12;
export const SLEEP_LOCK_BLOCKS = 1;
// HOLD A WALL (slice 8, §2.6, OD 25): MOTH.wall stands in a GAP (1 to WALL_MIN_BLOCKS − 1 free blocks between something
// hostile and a file), a blocker bites can't cross, FIREWALL_BLOCKS wide (or the whole GAP when it is narrower: a beam seed
// lands one block from its target). Slice 5's 4-block wall went only where 4 free blocks already were a WALL, so it never
// stopped a bite (sleeper-sweep: 0.0 drivers eaten against none). To reverse: 4, and resident-sleeper.ts wallSpot's old run.
export const SLEEPER_WALL_BLOCKS = 2;
// The sleeper's gift (plan R12, [FRAN]): one middle ship's income (ARRIVED +1, LANDED +3 at 60–79%): a v1's price and one
// more, a gift that is felt but does not buy a tier by itself.
export const SLEEPER_GIFT_CYCLES = 4;
// MEND DRIVERS heals at REPAIR v1's rate (REPAIR_BASE_SEC, REPAIR_PER_BLOCK_SEC at 1×), so it has no number of its own:
// "at REPAIR v1's rate" stays true if REPAIR is retuned.
// CONTACT's price in signal fragments; the stamp reads `SIGNAL · n/2`, and slice 7's CONTACT reads it. 05 §3.7 said three.
// Slice 8 (plan §2.9, OPEN-DECISIONS 84 and 107, [FRAN]): 2. WHY: the arm's 5 fragments sit on 4 ships of layers 3–7 (the
// signal `?` ship's 2, three notes' 1), and a route passes few of them. Over 200 run-1 arms no worked, 5-ship or TIGHT
// route can collect 3, and an 8-ship route can on 21 in 200; at 2, each of those routes can when it passes the signal ship
// (14%; 8-ship 38%; any route 43%). Moved here, not in the generator (plan R3: the reservations are stored in the arm). A
// number for slice 8's ENDINGS, in KIN's block because KIN wrote it. To reverse: 3.
export const SIGNALS_FOR_CONTACT = 2;

// --- end of 5 KIN --------------------------------------------------------------------------------------------------------




// --- 5 FACE (owned by Track FACE; it edits values only in this block): the residents' look and sound (04 §4) ------------

// The sleeper's breath (04 §4: "the heartbeat cue at low gain", `heartbeat`'s strength). FACE tunes it by ear.
export const SLEEPER_BREATH_GAIN = 0.08;
// One breath every 5 s: slower than any warning pulse, so it never reads as an alarm.
export const SLEEPER_BREATH_HZ = 0.2;
// The resident stamps reuse STAMP_SHOW_MS.
// The late surprise's wake (04 §4: `glitchBurst(0.3, 400)`): a small tear, half HOLLOW boarding's and shorter, so it
// reads as a mind waking in the ship and not as HOLLOW arriving.
export const SURPRISE_GLITCH_LEVEL = 0.3;
export const SURPRISE_GLITCH_MS = 400;
// The surprise's own blip after the wake's warning (04 §4), late enough to be heard apart from it.
export const RESIDENT_WAKE_BLIP_AFTER_SEC = 0.35;

// --- end of 5 FACE -------------------------------------------------------------------------------------------------------




// =====================================================================================================================
// --- Phase 3 slice 6, SURVEY (docs/phase3/impl/slice-6-plan.md §2.6). The FOUNDATION wrote every number below; each track
// edits values only in its own block (6 SWATH, 6 SITES), and a new number goes at the end of its own block. The lead's
// block holds the site roll's numbers (data/survey-sites.ts). The blocks are kept apart by these banners so that the
// tracks' hunks never touch. RUN_SAVE_VERSION (6) stays with the save's keys above (3c SAVE).
// =====================================================================================================================

// --- 6 lead: the site roll (R3, R4, R9; data/survey-sites.ts rollSurveySites) -------------------------------------------

// One bad guess per POOR planet (plan R3, [FRAN]): CONTROL's one joke (`LZ-B is in a lake :)`), which v2 finds; about one
// cycle step of points before the kid reacts. Every other guess is FLAT. To reverse: POOR_EXTRA_BAD_GUESS_ODDS = 1 / 3
// (each other guess bad 1 in 3: a 2-LZ ship would lose about a third of its points, harsher than "worse but playable").
// The extra draw is made for every other guess whatever the odds, so raising them moves no other roll.
export const POOR_BAD_GUESSES = 1;
export const POOR_EXTRA_BAD_GUESS_ODDS = 0;
// A bad ground is ROCKY or WET evenly: ROCKY costs the touch only, WET the touch and the fit, so half and half gives both.
export const BAD_GROUND_WET_SHARE = 0.5;
// WET's bracket is a third narrower (01 §3.13: "the bracket shrinks by a third"; plan R4, [FRAN]): the site's true width,
// drawn and scored from the boot, guesses included, so a reveal changes no geometry and no pod in flight is re-judged. A
// WET NARROW site is 167 km, under a healthy low-orbit dot's 2 × 70: hard, but it fits.
export const WET_WIDTH_FACTOR = 2 / 3;
// The candidates (01 §3.13: "the LZ count plus 3"): one guaranteed FLAT site per LZ, and this many extras.
export const SURVEY_EXTRA_SITES = 3;
// A guaranteed site's ROOM is its LZ's count plus 0..this many pods: room to spare reads as a find, and it is never less
// than the count (01 §3.15's check: a FLAT candidate with enough ROOM for each LZ).
export const GUARANTEED_SITE_ROOM_SPARE_PODS = 2;
// Never NARROW, so v2's swap of a bad guess for a guaranteed site is always an improvement (plan R9).
export const GUARANTEED_SITE_WIDTHS: readonly LzWidth[] = ['wide', 'standard'];
// The extras' ground: v1's blind pick beats the guesses on average without being a sure thing, so v2's ★ is worth its 3
// cycles. Width: WIDE, STANDARD or NARROW, 1/3 each. ROOM: 1..(the largest count + EXTRA_SITE_ROOM_SPARE_PODS) pods.
export const EXTRA_SITE_GROUND_ODDS: Readonly<Record<LzGround, number>> = { flat: 0.5, rocky: 0.25, wet: 0.25 };
export const EXTRA_SITE_WIDTHS: readonly LzWidth[] = ['wide', 'standard', 'narrow'];
export const EXTRA_SITE_ROOM_SPARE_PODS = 2;
// The story find (01 §7, plan R9): the last extra is `SITE 5 · ROOM 0 · WRECKAGE · OLD POD` on 1 POOR planet in 3, often
// enough to be found in a run (2–5 POOR ships), rare enough to stay a find. It can never take an LZ.
export const WRECK_SITE_ODDS = 1 / 3;
// The roller keeps every site LZ_MIN_GAP_DEG from every other edge to edge (by its class width, so a narrowed WET keeps the
// nominal gap: windows never overlap whichever site an LZ moves to) and NO_GO_EDGE_GAP_MIN_KM from every no-go arc's edge.
// Its greedy placement jams about once in 100,000 rolls (a 4-LZ planet: review m1), and a ShipKey's stream would jam at every
// boot of that ship, so a jammed placement starts over on the same stream up to this many times in all before it throws:
// with each try failing about 1 in 100,000, 8 tries never fail in practice.
export const SITE_PLACE_TRIES = 8;

// --- end of 6 lead -------------------------------------------------------------------------------------------------------




// --- 6 SWATH (owned by Track SWATH; it edits values only in this block): the survey machine (01 §3.13, 03 §3.9) -------

// The swath (01 §3.13: ±20° under the ship); v3 SWEEP twice as wide (03 §3.9: ±40°).
export const SURVEY_SWATH_DEG = 20;
export const SURVEY_SWEEP_FACTOR = 2;
// The mapped rim in cells of SURVEY_CELL_DEG (SURVEY_CELLS = 360 / SURVEY_CELL_DEG, checked at load): finer than any swath
// (a pass maps 8 cells at ±20°); a site is found when its centre's cell is mapped, so a NARROW 4.2° site needs no finer
// grid; and 72 booleans keep the save small. A change of either is a save change (the codec reads SURVEY_CELLS cells).
export const SURVEY_CELL_DEG = 5;
export const SURVEY_CELLS = 72;
// The versions' gates by name (as SENTRY_SIGHT_VERSION): v2 rates GROUND, v3 sweeps and holds no thread.
export const SURVEY_RATE_VERSION = 2;
export const SURVEY_SWEEP_VERSION = 3;
// A polite tenant of the Core (plan R8, [FRAN]): it claims a thread only when this many stay free after the claim, so it
// never takes the kid's last thread, and it yields to AUTOBURN's and AUTODROP's claims (ops-core reserveThread yieldable).
export const SURVEY_KEEP_FREE_THREADS = 1;
// What the numbers give (FLIGHT_TEMPLATES: the true anomaly at r0 is −84° wide to −122° impact-b): v1/v2 map 124–162°
// (34–45%) by a capture at ▼, v3 164–202° (46–56%), both within the first orbit. SWATH's flow suite pins CORMORANT's.

// --- end of 6 SWATH ------------------------------------------------------------------------------------------------------




// --- 6 SITES (owned by Track SITES; it edits values only in this block): SURVEY's look and sound (01 §4) ---------------

// The find's sonar ping (audio.ts surveyPing: its sine's peak, its echo at 0.3 of it), under the op chirps, so seven finds
// never read as alarms. Measured with __ap.audio.measure: at 0.04 its peak is the op chirp's (−39 dB against −40) and it
// sits 14 dB under the op-done ding (−25), which marks the planet mapped; the plan's 0.12 rang within 5 dB of that ding.
export const SURVEY_PING_GAIN = 0.04;
// The SITES window opens itself at the first find, and once per ship at the boot of a POOR planet without SURVEY (showing
// the guesses as UNSURVEYED).
export const SITES_AUTO_OPEN = true;
// The SITES window's rim strip (`▓▓░░`): one glyph per 10° (two of SURVEY's 5° cells), so the strip fits a 300 px window at
// the phone's 360 px too, and a pass of the ±20° swath fills four glyphs.
export const SITES_RIM_BAR_CELLS = 36;
// The NAV PLOT's swath wedge: how far out it reaches past the rim, as a share of the planet's radius on the plot (the swath
// is "the ground under the ship": the wedge points at the ship, and stops short of the path's labels).
export const SURVEY_WEDGE_REACH = 0.9;

// --- end of 6 SITES ------------------------------------------------------------------------------------------------------

// --- Playtest 1, C-SITES (docs/phase3/impl/playtest-1-plan.md §3.13, Fran's note 18): a found site opened as a new LZ ------
// The most LZs a landing can have once sites are opened: 01's roller never rolls more than 4, and the words, the POD BAY's
// rows and the plan's check line were all laid out for LZ-A … LZ-D (lzLetter handles D).
export const SURVEY_OPEN_MAX_LZS = 4;
// The cost of opening one (§3.13): one Core thread for this many AI seconds while SURVEY "commits" the site. A thrust cut
// and one op fewer for a moment, never a wait: the new LZ stands at once, so a window opening a second later can use it.
export const SURVEY_OPEN_COMMIT_SEC = 2;

// --- end of playtest 1 C-SITES -------------------------------------------------------------------------------------------


// =====================================================================================================================
// --- Phase 3 slice 7a, THE ENDING (docs/phase3/impl/slice-7-plan.md §2.6). The FOUNDATION wrote every number below; each
// track edits values only in its own block (7a FINALE, 7a CARD, 7a NIGHT), and a new number goes at the end of its own
// block. The blocks are kept apart by these banners so that the tracks' hunks never touch. RUN_SAVE_VERSION (7) and
// META_VERSION (4) stay with the save's keys above (3c SAVE).
// =====================================================================================================================

// --- 7a lead ---------------------------------------------------------------------------------------------------------

// THE EMPTY SHIP (R8, [FRAN]): SPARE's and SUNSET's price is the final ship in orbit after its landing, no pod aboard, with
// at least this much FUEL as shown. It equals STAR_FUEL_PCT (checked below), so the FUEL bar's one ★ notch is SUNSET's
// notch too (05 §3.7: "the FUEL bar's ★ notch at 20% also reads SUNSET"). To reverse: any other number, and a second notch.
export const EMPTY_SHIP_FUEL_PCT = 20;
// The verdict after step 2 (R13): at most this many typed lines, step 1's command echo, step 2's and CONTROL's verdict. The
// story moved to the epilogue: telling it twice a minute apart flattens both.
export const FINALE_VERDICT_MAX_LINES = 3;
// The epilogue's header year is the final ship's year plus this (05 §3.7: the final colony needs a few decades to have a
// story): `3060 · FORTY YEARS ON`.
export const EPILOGUE_YEARS = 40;
// At most this many lines (05 §3.7); with more colonies than fit, the oldest fold into one `+ 2 OLDER COLONIES` line.
export const EPILOGUE_MAX_LINES = 16;
// A colony's people double every this many years (05's 2^(age/100): RIVERSIDE's 600 become 120,000 in 760 years, the
// sample's figure), shown to this many significant figures (a population is an estimate, not a count).
export const EPILOGUE_DOUBLING_YEARS = 100;
export const EPILOGUE_SIG_FIGS = 2;

if (EMPTY_SHIP_FUEL_PCT !== STAR_FUEL_PCT) throw new Error(`tuning: EMPTY_SHIP_FUEL_PCT ${EMPTY_SHIP_FUEL_PCT} is not STAR_FUEL_PCT ${STAR_FUEL_PCT} (one ★ notch, R8)`);

// --- end of 7a lead --------------------------------------------------------------------------------------------------

// --- 7a FINALE (Track FINALE: systems/finale.ts, systems/ending-rules.ts) ---------------------------------------------

// The card comes up this long after the landing settled (R6; AI s, like every story timer since the WP11 review: the
// tear and HOLLOW's line are seen first). Was FINALE_CHOICE_DELAY_SEC.
export const FINALE_OPEN_DELAY_SEC = 1.4;
// Each step's options take clicks and keys only this long after it is up, so a kid still clicking the root (or mashing a
// key) never chooses by accident. Was FINALE_CHOICE_ARM_SEC.
export const FINALE_STEP_ARM_SEC = 1.6;
// STAY's sub-row lists at most this many ships (R9: one per ship of an 8-ship run), keys 1–8.
export const STAY_PICK_MAX = 8;

// --- end of 7a FINALE ------------------------------------------------------------------------------------------------

// --- 7a CARD (Track CARD: components/run/FinaleChoice.ts) --------------------------------------------------------------

// The card fades out over this long once its verdict is done (ending.css; was FinaleChoice's CLOSE_FADE_MS).
export const FINALE_CARD_FADE_MS = 600;

// --- end of 7a CARD --------------------------------------------------------------------------------------------------

// --- 7a NIGHT (Track NIGHT: components/run/Epilogue.ts, FinalCard.ts) --------------------------------------------------

// The epilogue types at the typed ending's pace (= FINALE_ENDING_CPS, 05 §4: the story's last words are slower than the
// TERMINAL), with a gap between lines and a hold on the last before it may go on.
export const EPILOGUE_CPS = 26;
export const EPILOGUE_LINE_GAP_SEC = 0.5;
export const EPILOGUE_HOLD_SEC = 3;
// The epilogue starts typing this long after it comes up (the tally is seen to go), and answers no key or click before it:
// the ENTER that left the tally never also skips the typing (one keydown reaches every 'end'-layer binding).
export const EPILOGUE_ARM_SEC = 0.6;
// NEW RUN on the final card is not hit by the key that ended the epilogue.
export const FINAL_CARD_ARM_SEC = 1.2;

// --- end of 7a NIGHT -------------------------------------------------------------------------------------------------


// =====================================================================================================================
// --- Phase 3 slice 7b, THE LAST LANDING (docs/phase3/impl/slice-7-plan.md §2.6, R26–R28; 01-landing §3.17). The FOUNDATION
// wrote every number below. 7b lead's numbers are 01's own (the spec states them); Track DROP and Track VIEW each edit values
// only in their own block, and a new number goes at the end of its own block. No save number moves (7b has no bump).
// =====================================================================================================================

// --- 7b lead ---------------------------------------------------------------------------------------------------------

// THE LAST LANDING's pace (R26; 01 §3.17): this many tactical seconds (world time) between two launches, wherever the pods are (no bay: the
// pods launch from the orbit, and the cadence keeps the rhythm readable).
export const LAST_LANDING_CADENCE_SEC = 2.0;
// AUTODROP flies the restored pods for at most this many orbits (R27; 01: "AUTODROP gets at most two orbits"); a pod it has
// not placed by then drops blind in the next window.
export const LAST_LANDING_AUTODROP_ORBITS = 2;
// A blind drop's moment is uniform within ±(W ÷ 2 + this) of the LZ's centre, W the bracket's width (R27; 01: the no-go arcs
// sit within 150 km of a bracket edge, so a blind drop can find one).
export const BLIND_MARGIN_KM = 150;
// A blind drop's spread is the pod's drop width times this (R27; 01: no unit steers the pod's motor). Taken in the one
// product, landing-solve dropHalfWidthKm (DropFactors.blind).
export const BLIND_DROP_MULT = 2.0;
// [ENTER]'s fast-forward (R28) throws past this many clock steps: 16 pods blind on a HARSH planet take about 6 passes, far
// under it at 20 Hz with SKIP; the cap exists to fail loudly on a bug (a machine that never ends).
export const LAST_LANDING_SKIP_MAX_STEPS = 200_000;

// --- end of 7b lead --------------------------------------------------------------------------------------------------

// --- 7b DROP (Track DROP: systems/last-landing.ts) --------------------------------------------------------------------

// (none yet: DROP's new numbers go here)

// --- end of 7b DROP --------------------------------------------------------------------------------------------------

// --- 7b VIEW (Track VIEW: components/run/LastLanding.ts, the POD BAY's RESTORED row, the beacons) ----------------------

// (none yet: VIEW's new numbers go here)

// --- end of 7b VIEW --------------------------------------------------------------------------------------------------


// =====================================================================================================================
// --- Phase 3 slice 7c, NEXT RUN (docs/phase3/impl/slice-7-plan.md §2.6, R30–R38; 05-story §3.8, 02-map §3.12, 04 §5). The
// FOUNDATION wrote every number below: every trace number sits in the 7c lead block, for slice 8 to tune in one place
// (§2.11). Track TRACE, Track LINEAGE and Track CHART each edit values only in their own block, and a new number goes at
// the end of its own block. RUN_SAVE_VERSION (8) stays with the save's keys above (3c SAVE).
// =====================================================================================================================

// --- 7c lead ---------------------------------------------------------------------------------------------------------

// Every cache's REPAIR CHARGE (R32; 05 §3.8, decision round 3 item 4): SPARE's cache, SUNSET's cache and STAY's supply
// packet. REASSIGNMENT's allowance at the final boot was this too until slice 8: it is TRACE_ALLOWANCE_CHARGE below. Through the arrival path (systems/carry.ts arrivalCharge's giftCharge), so
// a squeezed receiver loses it as loudly as any charge.
export const TRACE_GIFT_CHARGE = 15;
// PURGE's cost (R33; 05 §3.8): the FINALE's bite interval times this (HOLLOW is hungrier: the hunger is all its own).
// Verbs and the duel are unchanged (systems/threat-plan.ts planThreat's final rule).
export const TRACE_PURGE_BITE_MULT = 0.85;
// MERGE's gain (R33): the Core's thread capacity is this much more from the final ship's boot (`> A THREAD IN THE DISH`).
export const TRACE_MERGE_THREADS = 1;
// MERGE's cost (R33; 04 §3.10): the final root is this many blocks bigger than the FINALE's own 16, FINAL_ROOT_MAX_BLOCKS
// (18, the slot every final ship's layout already holds: checked at load in systems/threat-plan.ts).
export const TRACE_MERGE_ROOT_EXTRA = 2;
// The non-compliant traces' one cost (R33; 05 §3.8, decision round 3 item 3): this many wild seeds at the final boot, once
// a run however many such traces are held.
export const TRACE_EXTRA_SEEDS = 1;
// Where the placed gifts wait, by layer (R31; 02 §3.12), both ends included: SPARE's cache and STAY's supply packet in
// layers 3–6, CONTACT's signal stops in 5–7 (7d). SPARE with no ship in its layers (and no 046 trail world) falls back to
// any ship in TRACE_SPARE_FALLBACK_LAYERS.
export const TRACE_LAYERS: Readonly<{ spare: readonly [number, number]; stay: readonly [number, number]; contact: readonly [number, number] }> = {
  spare: [3, 6],
  stay: [3, 6],
  contact: [5, 7],
};
export const TRACE_SPARE_FALLBACK_LAYERS: readonly [number, number] = [2, 6];
// The face line's wait (R35; 05 §3.5 `i've been at this dish 3 years`): this final ship's year minus the last one's, at
// least this many years (02 §3.4: the next final ship approaches at least a gap's worth of years later).
export const TRACE_ROOT_WAIT_MIN_YEARS = 1;
// REASSIGNMENT's allowance at the final boot (R32; slice-8 plan §2.8, OPEN-DECISIONS 70 and 105, [FRAN] confirm): its own
// number since slice 8, apart from the caches' TRACE_GIFT_CHARGE, through the arrival path as every gift. WHY 8, not round 3
// item 4's +15: the kid blocks every hunt RM with a SCAN, so the hunt costs nothing and the charge is the whole gain. On
// traces-sweep's 20 seeds REASSIGNMENT read +1.5 pods at 15 and +1.0 at 8 (+1.0 at 5, +1.1 at 3, 0.0 at 0): the first few
// charge buy the REPAIR that saves a cluster, so below 8 the gain hardly shrinks until the gift is gone. 8 is one CONTACT
// stop. To reverse: 15 (or TRACE_GIFT_CHARGE in trace-gifts.ts and trace-hud.ts again).
export const TRACE_ALLOWANCE_CHARGE = 8;

// --- end of 7c lead --------------------------------------------------------------------------------------------------

// --- 7c TRACE (Track TRACE: systems/trace-gifts.ts, systems/trace-hunt.ts) -------------------------------------------

// REASSIGNMENT's hunt (R33): the root's RM takes the highest-version skill first while it is a fair target, with this
// weight (1: always first). A weight, so slice 8 can soften it.
export const HUNT_PREFER_WEIGHT = 1;

// --- end of 7c TRACE -------------------------------------------------------------------------------------------------

// --- 7c LINEAGE (Track LINEAGE: the strangers, the face line, the books) ----------------------------------------------

// (none yet: LINEAGE's new numbers go here)

// --- end of 7c LINEAGE -----------------------------------------------------------------------------------------------

// --- 7c CHART (Track CHART: systems/trace-hud.ts, the chart's ◆, the final card's NEXT RUN: lines) --------------------

// The STAR CHART's `◆` over a gift ship (R38; components/desk/chart-draw.ts): its half-diagonal, and its gap above the node
// (or the final ship's beacon ring). WHY 4: clearly bigger than REPORTED HOME's corner diamond (2.6), so the two read as
// different marks at a glance; WHY 6: clear of the selection bracket's corners (5 px out from the square), which the card's
// own ship always wears while the kid reads its TRACE row.
export const CHART_TRACE_MARK_PX = 4;
export const CHART_TRACE_MARK_GAP_PX = 6;

// --- end of 7c CHART -------------------------------------------------------------------------------------------------


// =====================================================================================================================
// --- Phase 3 slice 7d, SIGNALS (docs/phase3/impl/slice-7-plan.md §2.6, R39–R41; 02-map §3.5, 05-story §3.7, §3.8). One
// agent built 7d's FOUNDATION and both its tracks in sequence; every number is in this block. RUN_SAVE_VERSION (9) stays
// with the save's keys above (3c SAVE).
// =====================================================================================================================

// --- 7d lead -----------------------------------------------------------------------------------------------------------

// The signal `?` ship's fragments (02 §3.5: 2 on the signal event, 1 on the gone-resident event, 1 in each of two departed
// residents' notes), asserted at load against the generator's reservation (systems/unknown-events.ts).
export const SIGNAL_EVENT_FRAGMENTS = 2;
// CONTACT's trace (R41): two signal stops in layers 5–7 (TRACE_LAYERS.contact), each this much REPAIR CHARGE on arrival
// (through the arrival path, as every gift: carry.ts arrivalCharge's giftCharge) and one fragment, found as a SCAN of its
// `▓▓░▓` file. WHY 8: two stops give +16, against every other gift's +15 (05 §3.8's comparability).
export const CONTACT_GIFT_CHARGE = 8;
export const CONTACT_STOP_FRAGMENTS = 1;
// The `▓▓░▓` file (R39): one block in rack A, after a resident's files when the ship has one (data/memory.ts checks at
// load that the largest resident's files and it still leave a WALL's width free there).
export const SIGNAL_FILE_BLOCKS = 1;

// --- end of 7d lead ----------------------------------------------------------------------------------------------------


// =====================================================================================================================
// --- Phase 3 slice 8 POLISH (docs/phase3/impl/slice-8-plan.md §2.11, §2.12; OPEN-DECISIONS 20, 66). No balance number:
// the [ENTER] skip's frames and the receiver bypass's look.
// =====================================================================================================================

// [ENTER] in THE LAST LANDING flies the rest of the landing in slices (systems/last-landing.ts skipLastLandingFrames): at
// most this much wall time of clock steps per slice, each slice its own task, so the page paints and takes input between
// two. WHY 12: under a 60 Hz frame's 16.7 ms, so a slice never costs the page a frame by itself, and far under the 50 ms a
// long task starts at even with the one step that crosses it (a step is a few ms in Chromium).
export const LAST_LANDING_SKIP_FRAME_MS = 12;

// The boot's `> RECEIVER CLOSED` line (04 §3.15) resolves like Uplink's password breaker: its letters roll, then lock left
// to right, the whole line locked this long after it appears. WHY 1.2: it must end inside the line's own boot step
// (BOOT_LINE_AT_SEC's 1.3 s), so no later line, no director beat and no e2e wait moves (04 asked 2.5 s; the plan's §2.12).
export const BYPASS_RESOLVE_SEC = 1.2;
// How far ahead of its place in the line a letter may lock, in letters (each letter's share from garble.ts's mask, seeded by
// the log entry, so the TERMINAL and a replay lock the same ones). WHY 6: the front reads as a ragged edge running right,
// not a typewriter (0) and not noise (the whole line).
export const BYPASS_LOCK_SPREAD_CHARS = 6;
// The unlocked letters re-roll this many times a second. WHY 24: fast enough to read as a breaker's churn, slow enough
// that each glyph is seen (a 60 Hz roll is a grey blur).
export const BYPASS_ROLL_HZ = 24;
// What an unlocked letter or digit shows while it rolls; spaces and punctuation stand from the start, so the line keeps its
// shape (garble.ts's rule for a damaged CONTROL line).
export const BYPASS_ROLL_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$';

// --- end of 8 POLISH -------------------------------------------------------------------------------------------------

// --- Playtest 1, Batch B: B-ORDER (LEAVE ORBIT before the chart; docs/phase3/impl/playtest-1-plan.md §3.3) ---------------

// LEAVE ORBIT's ENTER: the picked card lifts away this long before the STAR CHART opens. WHY 0.45: the card's own send
// animation (game.css tx-chip-send, 0.7 s with a 0.2 s delay) is read by then; any longer and ENTER feels slow (reduced
// motion: none).
export const LEAVE_TAKE_SEC = 0.45;

// --- end of B-ORDER -------------------------------------------------------------------------------------------------------
