// Slice 3c review fix M3: the saved state's shape, pinned by RUN_SAVE_VERSION. A save written by one build is read by the
// next one; a field a slice adds, renames or drops in RunState or a ship slice, or a content version that moves, makes every
// save in flight RUN SAVE CAN'T RESUME unless RUN_SAVE_VERSION is bumped and RUN_SAVE_MIGRATIONS steps the old saves up
// (save-codec migrateRunSave; slice 4's run.skills was the first such step, 1 → 2, its review's burn.auto the second,
// slices 4c–4e's AUTODROP, SENTRY and AUTOBURN v3 fields the third). This suite fails until both are done and the new
// shape is pinned here under the new version. Catalogue and content changes should go through RUN_SAVE_MIGRATIONS where
// they can (a save keeps its run; a content refusal ends it as 'signal-lost').
// The shape is every key path of a SHIP DONE save on run 1's worked route (store-level, no flights), down to three levels
// (an array's first element stands for its items), and contentVersions(). `AP_PIN_PRINT=1` prints the shape to pin.
import { check, finish } from '../landing/checks';
import type { GameState } from '@state/schema';
import { createStore } from '@state/store';
import { createInitialState } from '@state/initial';
import { contentVersions, RUN_SAVE_MIGRATIONS } from '@systems/save-codec';
import { RUN_SAVE_VERSION } from '@data/tuning';
import { stubStorage, pageOpen, storedSave, receiveToReport, toDesk, beamTo, WORKED_ROUTE } from './save-fixture';

const SEED = 7;
const storage = stubStorage();
const store = createStore<GameState>(createInitialState({ seed: SEED }));
pageOpen(store, storage, SEED);
receiveToReport(store);
toDesk(store);
beamTo(store, WORKED_ROUTE[1]!);
toDesk(store);
const { save } = storedSave(storage);
if (save.payload.kind !== 'world') throw new Error('shape-pin: the SHIP DONE save is not a world payload');

// Memory segments come in many types, each with its own fields (the resume's assertMemoryInvariants checks them): only the
// strip itself is pinned, not its items.
const OPAQUE = new Set(['memory', 'segs', 'entries', 'pods', 'lzs']);

function paths(value: unknown, prefix: string, depth: number, out: string[]): string[] {
  if (depth === 0 || value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    if (value.length > 0) paths(value[0], `${prefix}[]`, depth - 1, out);
    return out;
  }
  for (const key of Object.keys(value).sort()) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    out.push(path);
    if (!OPAQUE.has(key)) paths((value as Record<string, unknown>)[key], path, depth - 1, out);
  }
  return out;
}

const shape = {
  run: paths(save.payload.run, '', 3, []),
  slices: paths(save.payload.slices, '', 3, []),
  content: contentVersions(),
};
if (process.env.AP_PIN_PRINT === '1') console.log(JSON.stringify(shape));

// Pinned shapes by RUN_SAVE_VERSION. Bumping the version: pin the new shape (AP_PIN_PRINT=1) beside the old one, and add
// RUN_SAVE_MIGRATIONS[old] that turns an old save into the new shape.
const PINNED: Readonly<Record<number, typeof shape>> = {
  1: {
    run: [
      'arrival', 'arrival.boarded', 'arrival.card', 'arrival.cardCharge', 'arrival.chargeCarried',
      'arrival.chargeFloorAdded', 'arrival.chargeOverflowLost', 'arrival.deliveries', 'arrival.eccCorrected',
      'arrival.hits', 'arrival.scripted', 'arrival.seeds', 'arrival.starCredit', 'arrival.stars', 'beamOut',
      'coreLost', 'endCause', 'ghostSpoken', 'hollowNamed', 'hollowUnits', 'inbox', 'inbox.read', 'lastUnit',
      'licences', 'log', 'log.autoOpened', 'log.found', 'log.read', 'log.scanned', 'log.toldReading', 'map', 'map.arm',
      'map.armSeed', 'map.galaxyYear', 'map.history', 'map.history.colonies', 'map.history.departures',
      'map.history.finalSerial', 'map.history.gap', 'map.history.lastUnitNumber', 'map.history.routes',
      'map.history.valveYears', 'map.noise', 'map.pendingExtra', 'map.route', 'map.run', 'map.startYear',
      'map.version', 'map.world', 'next', 'pendingStarCredit', 'pendingStars', 'phase', 'repairRenewedOn', 'repo',
      'repo.nextId', 'repo.pick', 'repo.requests', 'rev', 'seed', 'shipIndex', 'ships', 'ships[].colonistsAboard',
      'ships[].colony', 'ships[].depth', 'ships[].fuelLeftPct', 'ships[].landedInLz', 'ships[].lzs', 'ships[].noGo',
      'ships[].notLaunched', 'ships[].offSite', 'ships[].outcome', 'ships[].parked', 'ships[].pods', 'ships[].points',
      'ships[].restored', 'ships[].ringMiss', 'ships[].shipId', 'ships[].shipName', 'ships[].slot', 'ships[].stars',
      'simulationRetryUsed', 'skillTrainedOn', 'stats', 'stats.capRefusals', 'stats.deal', 'stats.deletes',
      'stats.demos', 'stats.driversBitten', 'stats.driversLost', 'stats.manualCaptures', 'stats.moves',
      'stats.repairs', 'threat', 'threat.aboard', 'threat.age', 'threat.boardCause', 'threat.boardedAtDepth',
      'threat.current', 'threat.current.boards', 'threat.current.isFinal', 'threat.current.oneHopFromFinal',
      'threat.current.stage', 'threat.eatenDrivers', 'threat.fed', 'threat.lastTally', 'threat.lastTally.fed',
      'threat.lastTally.left', 'threat.lastTally.traceAfter', 'threat.lastTally.traceBefore', 'threat.stagesPlayed',
      'threat.told', 'threat.told.keepCharge', 'threat.told.noticed', 'threat.trace', 'transit', 'tutorial',
      'unitNumber', 'upgrades', 'wave',
    ],
    slices: [
      'burn', 'burn.acceptOnly', 'burn.auto', 'burn.auto.atAi', 'burn.auto.end', 'burn.auto.phase',
      'burn.closedIdleAiSec', 'burn.coastAtAi', 'burn.dvDeliveredKmS', 'burn.firing', 'burn.firingFor',
      'burn.firingSource', 'burn.fuelPct', 'burn.ghost', 'burn.ghostBursts', 'burn.heading', 'burn.lastTickDvKmS',
      'burn.lockHoldAiSec', 'burn.missedIdleTac', 'burn.omega', 'burn.presetAligning', 'burn.rotInput', 'burn.sasMode',
      'burn.status', 'burn.thrustPct', 'burn.thrustTac', 'clock', 'clock.aiSec', 'clock.debugWarp', 'clock.overclock',
      'clock.pace', 'clock.paused', 'clock.skipEndTSec', 'clock.skipWarp', 'clock.skipWaypoint', 'clock.speed',
      'clock.speedTarget', 'clock.tSec', 'hazards', 'hazards.debrisHits', 'hazards.hitIds', 'hollow',
      'hollow.biteInSec', 'hollow.bitesAt', 'hollow.calmAiSec', 'hollow.cfg', 'hollow.cfg.burnMult', 'hollow.cfg.deal',
      'hollow.cfg.drainPerSec', 'hollow.cfg.landMult', 'hollow.cfg.onlySeedsBite', 'hollow.cfg.seed',
      'hollow.cfg.spreadEverySec', 'hollow.cfg.story', 'hollow.cfg.verbs', 'hollow.cfg.wake', 'hollow.deal',
      'hollow.deal.entryId', 'hollow.deal.hasteUntilAi', 'hollow.deal.pauseUntilAi', 'hollow.deal.phase',
      'hollow.deal.pod', 'hollow.deal.segId', 'hollow.deal.startAddr', 'hollow.finale', 'hollow.finale.ending',
      'hollow.finale.phase', 'hollow.finale.restoredHalf', 'hollow.finale.restoredInPlace',
      'hollow.finale.unresolvedUntilAi', 'hollow.phase', 'hollow.scriptTargetId', 'hollow.seedInSec',
      'hollow.seedMoments', 'hollow.seedTelegraph', 'hollow.seedsLanded', 'hollow.story', 'hollow.unlinkedLastSpare',
      'hollow.untriedTools', 'hollow.verb', 'hollow.verbInSec', 'hollow.verbMoments', 'hollow.verbTelegraphs',
      'hollow.verbsBlocked', 'hollow.verbsLanded', 'hollow.wakeAtAi', 'hollow.wakeHeld', 'hollow.wakeHoldEndedAtAi',
      'landing', 'landing.bay', 'landing.bay.cadenceLeftTac', 'landing.bay.loaded', 'landing.bay.reloadTac',
      'landing.colony', 'landing.colonyFirstRun', 'landing.decay', 'landing.decay.kicks', 'landing.decay.last',
      'landing.decay.lastKickTSec', 'landing.declined', 'landing.drag', 'landing.ended', 'landing.finalShip',
      'landing.forgiveness', 'landing.fuelAtEndPct', 'landing.ghostBursts', 'landing.goLow', 'landing.hurt',
      'landing.lead', 'landing.lingerAiSec', 'landing.loadNext', 'landing.lzs', 'landing.noDriverAiSec',
      'landing.noGo', 'landing.orbitEpoch', 'landing.pods', 'landing.startedAtTSec', 'landing.terrain',
      'landing.window', 'level', 'level.aNominalKmS2', 'level.cruiseWarp', 'level.dvBudgetKmS', 'level.memoryClass',
      'level.planet', 'level.planet.R', 'level.planet.mu', 'level.planet.rAtm', 'level.r0', 'level.ring',
      'level.ring.max', 'level.ring.min', 'level.shipId', 'level.shipName', 'level.shrink',
      'level.shrink.edgeBackOffTac', 'level.shrink.marginMinTac', 'level.shrink.marginTac', 'level.shrink.reactionTac',
      'level.shrink.smallLoopFactor', 'level.tacticalWarp', 'level.zones', 'memory', 'mission', 'mission.colonists',
      'mission.destination', 'mission.shipId', 'mission.transmissionNum', 'mission.unitId', 'mission.wave', 'orbit',
      'orbit.vx', 'orbit.vy', 'orbit.x', 'orbit.y',
    ],
    content: { arm: 1, generator: 2, update: 1, mapState: 1, catalogue: 1 },
  },
  // Slice 4 (the skill tree): run.skills replaces skillTrainedOn, run.stats.dropDemos, arrival.skills, burn.auto's mode
  // fields (RUN_SAVE_MIGRATIONS[1]).
  2: {
    run: [
      'arrival', 'arrival.boarded', 'arrival.card', 'arrival.cardCharge', 'arrival.chargeCarried',
      'arrival.chargeFloorAdded', 'arrival.chargeOverflowLost', 'arrival.deliveries', 'arrival.eccCorrected',
      'arrival.hits', 'arrival.scripted', 'arrival.seeds', 'arrival.skills', 'arrival.starCredit', 'arrival.stars',
      'beamOut', 'coreLost', 'endCause', 'ghostSpoken', 'hollowNamed', 'hollowUnits', 'inbox', 'inbox.read', 'lastUnit',
      'licences', 'log', 'log.autoOpened', 'log.found', 'log.read', 'log.scanned', 'log.toldReading', 'map', 'map.arm',
      'map.armSeed', 'map.galaxyYear', 'map.history', 'map.history.colonies', 'map.history.departures',
      'map.history.finalSerial', 'map.history.gap', 'map.history.lastUnitNumber', 'map.history.routes',
      'map.history.valveYears', 'map.noise', 'map.pendingExtra', 'map.route', 'map.run', 'map.startYear', 'map.version',
      'map.world', 'next', 'pendingStarCredit', 'pendingStars', 'phase', 'repairRenewedOn', 'repo', 'repo.nextId',
      'repo.pick', 'repo.requests', 'rev', 'seed', 'shipIndex', 'ships', 'ships[].colonistsAboard', 'ships[].colony',
      'ships[].depth', 'ships[].fuelLeftPct', 'ships[].landedInLz', 'ships[].lzs', 'ships[].noGo',
      'ships[].notLaunched', 'ships[].offSite', 'ships[].outcome', 'ships[].parked', 'ships[].pods', 'ships[].points',
      'ships[].restored', 'ships[].ringMiss', 'ships[].shipId', 'ships[].shipName', 'ships[].slot', 'ships[].stars',
      'simulationRetryUsed', 'skills', 'skills.announced', 'skills.announced.autoburn', 'skills.announced.autodrop',
      'skills.announced.sentry', 'skills.announced.survey', 'skills.bought', 'skills.earned', 'skills.grants',
      'skills.opened', 'skills.pending', 'skills.skillGrants', 'stats', 'stats.capRefusals', 'stats.deal',
      'stats.deletes', 'stats.demos', 'stats.driversBitten', 'stats.driversLost', 'stats.dropDemos',
      'stats.manualCaptures', 'stats.moves', 'stats.repairs', 'threat', 'threat.aboard', 'threat.age',
      'threat.boardCause', 'threat.boardedAtDepth', 'threat.current', 'threat.current.boards', 'threat.current.isFinal',
      'threat.current.oneHopFromFinal', 'threat.current.stage', 'threat.eatenDrivers', 'threat.fed', 'threat.lastTally',
      'threat.lastTally.fed', 'threat.lastTally.left', 'threat.lastTally.traceAfter', 'threat.lastTally.traceBefore',
      'threat.stagesPlayed', 'threat.told', 'threat.told.keepCharge', 'threat.told.noticed', 'threat.trace', 'transit',
      'tutorial', 'unitNumber', 'upgrades', 'wave',
    ],
    slices: [
      'burn', 'burn.acceptOnly', 'burn.auto', 'burn.auto.atAi', 'burn.auto.claimed', 'burn.auto.end', 'burn.auto.mode',
      'burn.auto.phase', 'burn.auto.targetKm', 'burn.auto.waitingSinceTSec', 'burn.closedIdleAiSec', 'burn.coastAtAi',
      'burn.dvDeliveredKmS', 'burn.firing', 'burn.firingFor', 'burn.firingSource', 'burn.fuelPct', 'burn.ghost',
      'burn.ghostBursts', 'burn.heading', 'burn.lastTickDvKmS', 'burn.lockHoldAiSec', 'burn.missedIdleTac',
      'burn.omega', 'burn.presetAligning', 'burn.rotInput', 'burn.sasMode', 'burn.status', 'burn.thrustPct',
      'burn.thrustTac', 'clock', 'clock.aiSec', 'clock.debugWarp', 'clock.overclock', 'clock.pace', 'clock.paused',
      'clock.skipEndTSec', 'clock.skipWarp', 'clock.skipWaypoint', 'clock.speed', 'clock.speedTarget', 'clock.tSec',
      'hazards', 'hazards.debrisHits', 'hazards.hitIds', 'hollow', 'hollow.biteInSec', 'hollow.bitesAt',
      'hollow.calmAiSec', 'hollow.cfg', 'hollow.cfg.burnMult', 'hollow.cfg.deal', 'hollow.cfg.drainPerSec',
      'hollow.cfg.landMult', 'hollow.cfg.onlySeedsBite', 'hollow.cfg.seed', 'hollow.cfg.spreadEverySec',
      'hollow.cfg.story', 'hollow.cfg.verbs', 'hollow.cfg.wake', 'hollow.deal', 'hollow.deal.entryId',
      'hollow.deal.hasteUntilAi', 'hollow.deal.pauseUntilAi', 'hollow.deal.phase', 'hollow.deal.pod',
      'hollow.deal.segId', 'hollow.deal.startAddr', 'hollow.finale', 'hollow.finale.ending', 'hollow.finale.phase',
      'hollow.finale.restoredHalf', 'hollow.finale.restoredInPlace', 'hollow.finale.unresolvedUntilAi', 'hollow.phase',
      'hollow.scriptTargetId', 'hollow.seedInSec', 'hollow.seedMoments', 'hollow.seedTelegraph', 'hollow.seedsLanded',
      'hollow.story', 'hollow.unlinkedLastSpare', 'hollow.untriedTools', 'hollow.verb', 'hollow.verbInSec',
      'hollow.verbMoments', 'hollow.verbTelegraphs', 'hollow.verbsBlocked', 'hollow.verbsLanded', 'hollow.wakeAtAi',
      'hollow.wakeHeld', 'hollow.wakeHoldEndedAtAi', 'landing', 'landing.bay', 'landing.bay.cadenceLeftTac',
      'landing.bay.loaded', 'landing.bay.reloadTac', 'landing.colony', 'landing.colonyFirstRun', 'landing.decay',
      'landing.decay.kicks', 'landing.decay.last', 'landing.decay.lastKickTSec', 'landing.declined', 'landing.drag',
      'landing.ended', 'landing.finalShip', 'landing.forgiveness', 'landing.fuelAtEndPct', 'landing.ghostBursts',
      'landing.goLow', 'landing.hurt', 'landing.lead', 'landing.lingerAiSec', 'landing.loadNext', 'landing.lzs',
      'landing.noDriverAiSec', 'landing.noGo', 'landing.orbitEpoch', 'landing.pods', 'landing.startedAtTSec',
      'landing.terrain', 'landing.window', 'level', 'level.aNominalKmS2', 'level.cruiseWarp', 'level.dvBudgetKmS',
      'level.memoryClass', 'level.planet', 'level.planet.R', 'level.planet.mu', 'level.planet.rAtm', 'level.r0',
      'level.ring', 'level.ring.max', 'level.ring.min', 'level.shipId', 'level.shipName', 'level.shrink',
      'level.shrink.edgeBackOffTac', 'level.shrink.marginMinTac', 'level.shrink.marginTac', 'level.shrink.reactionTac',
      'level.shrink.smallLoopFactor', 'level.tacticalWarp', 'level.zones', 'memory', 'mission', 'mission.colonists',
      'mission.destination', 'mission.shipId', 'mission.transmissionNum', 'mission.unitId', 'mission.wave', 'orbit',
      'orbit.vx', 'orbit.vy', 'orbit.x', 'orbit.y',
    ],
    content: { arm: 1, generator: 2, update: 1, mapState: 1, catalogue: 1 },
  },
  // Slice 4 review: burn.auto's burn in hand and capture flag (RUN_SAVE_MIGRATIONS[2]).
  3: {
    run: [
      'arrival', 'arrival.boarded', 'arrival.card', 'arrival.cardCharge', 'arrival.chargeCarried',
      'arrival.chargeFloorAdded', 'arrival.chargeOverflowLost', 'arrival.deliveries', 'arrival.eccCorrected',
      'arrival.hits', 'arrival.scripted', 'arrival.seeds', 'arrival.skills', 'arrival.starCredit', 'arrival.stars',
      'beamOut', 'coreLost', 'endCause', 'ghostSpoken', 'hollowNamed', 'hollowUnits', 'inbox', 'inbox.read', 'lastUnit',
      'licences', 'log', 'log.autoOpened', 'log.found', 'log.read', 'log.scanned', 'log.toldReading', 'map', 'map.arm',
      'map.armSeed', 'map.galaxyYear', 'map.history', 'map.history.colonies', 'map.history.departures',
      'map.history.finalSerial', 'map.history.gap', 'map.history.lastUnitNumber', 'map.history.routes',
      'map.history.valveYears', 'map.noise', 'map.pendingExtra', 'map.route', 'map.run', 'map.startYear', 'map.version',
      'map.world', 'next', 'pendingStarCredit', 'pendingStars', 'phase', 'repairRenewedOn', 'repo', 'repo.nextId',
      'repo.pick', 'repo.requests', 'rev', 'seed', 'shipIndex', 'ships', 'ships[].colonistsAboard', 'ships[].colony',
      'ships[].depth', 'ships[].fuelLeftPct', 'ships[].landedInLz', 'ships[].lzs', 'ships[].noGo',
      'ships[].notLaunched', 'ships[].offSite', 'ships[].outcome', 'ships[].parked', 'ships[].pods', 'ships[].points',
      'ships[].restored', 'ships[].ringMiss', 'ships[].shipId', 'ships[].shipName', 'ships[].slot', 'ships[].stars',
      'simulationRetryUsed', 'skills', 'skills.announced', 'skills.announced.autoburn', 'skills.announced.autodrop',
      'skills.announced.sentry', 'skills.announced.survey', 'skills.bought', 'skills.earned', 'skills.grants',
      'skills.opened', 'skills.pending', 'skills.skillGrants', 'stats', 'stats.capRefusals', 'stats.deal',
      'stats.deletes', 'stats.demos', 'stats.driversBitten', 'stats.driversLost', 'stats.dropDemos',
      'stats.manualCaptures', 'stats.moves', 'stats.repairs', 'threat', 'threat.aboard', 'threat.age',
      'threat.boardCause', 'threat.boardedAtDepth', 'threat.current', 'threat.current.boards', 'threat.current.isFinal',
      'threat.current.oneHopFromFinal', 'threat.current.stage', 'threat.eatenDrivers', 'threat.fed', 'threat.lastTally',
      'threat.lastTally.fed', 'threat.lastTally.left', 'threat.lastTally.traceAfter', 'threat.lastTally.traceBefore',
      'threat.stagesPlayed', 'threat.told', 'threat.told.keepCharge', 'threat.told.noticed', 'threat.trace', 'transit',
      'tutorial', 'unitNumber', 'upgrades', 'wave',
    ],
    slices: [
      'burn', 'burn.acceptOnly', 'burn.auto', 'burn.auto.atAi', 'burn.auto.captured', 'burn.auto.claimed', 'burn.auto.end', 'burn.auto.flying', 'burn.auto.mode',
      'burn.auto.phase', 'burn.auto.targetKm', 'burn.auto.waitingSinceTSec', 'burn.closedIdleAiSec', 'burn.coastAtAi',
      'burn.dvDeliveredKmS', 'burn.firing', 'burn.firingFor', 'burn.firingSource', 'burn.fuelPct', 'burn.ghost',
      'burn.ghostBursts', 'burn.heading', 'burn.lastTickDvKmS', 'burn.lockHoldAiSec', 'burn.missedIdleTac',
      'burn.omega', 'burn.presetAligning', 'burn.rotInput', 'burn.sasMode', 'burn.status', 'burn.thrustPct',
      'burn.thrustTac', 'clock', 'clock.aiSec', 'clock.debugWarp', 'clock.overclock', 'clock.pace', 'clock.paused',
      'clock.skipEndTSec', 'clock.skipWarp', 'clock.skipWaypoint', 'clock.speed', 'clock.speedTarget', 'clock.tSec',
      'hazards', 'hazards.debrisHits', 'hazards.hitIds', 'hollow', 'hollow.biteInSec', 'hollow.bitesAt',
      'hollow.calmAiSec', 'hollow.cfg', 'hollow.cfg.burnMult', 'hollow.cfg.deal', 'hollow.cfg.drainPerSec',
      'hollow.cfg.landMult', 'hollow.cfg.onlySeedsBite', 'hollow.cfg.seed', 'hollow.cfg.spreadEverySec',
      'hollow.cfg.story', 'hollow.cfg.verbs', 'hollow.cfg.wake', 'hollow.deal', 'hollow.deal.entryId',
      'hollow.deal.hasteUntilAi', 'hollow.deal.pauseUntilAi', 'hollow.deal.phase', 'hollow.deal.pod',
      'hollow.deal.segId', 'hollow.deal.startAddr', 'hollow.finale', 'hollow.finale.ending', 'hollow.finale.phase',
      'hollow.finale.restoredHalf', 'hollow.finale.restoredInPlace', 'hollow.finale.unresolvedUntilAi', 'hollow.phase',
      'hollow.scriptTargetId', 'hollow.seedInSec', 'hollow.seedMoments', 'hollow.seedTelegraph', 'hollow.seedsLanded',
      'hollow.story', 'hollow.unlinkedLastSpare', 'hollow.untriedTools', 'hollow.verb', 'hollow.verbInSec',
      'hollow.verbMoments', 'hollow.verbTelegraphs', 'hollow.verbsBlocked', 'hollow.verbsLanded', 'hollow.wakeAtAi',
      'hollow.wakeHeld', 'hollow.wakeHoldEndedAtAi', 'landing', 'landing.bay', 'landing.bay.cadenceLeftTac',
      'landing.bay.loaded', 'landing.bay.reloadTac', 'landing.colony', 'landing.colonyFirstRun', 'landing.decay',
      'landing.decay.kicks', 'landing.decay.last', 'landing.decay.lastKickTSec', 'landing.declined', 'landing.drag',
      'landing.ended', 'landing.finalShip', 'landing.forgiveness', 'landing.fuelAtEndPct', 'landing.ghostBursts',
      'landing.goLow', 'landing.hurt', 'landing.lead', 'landing.lingerAiSec', 'landing.loadNext', 'landing.lzs',
      'landing.noDriverAiSec', 'landing.noGo', 'landing.orbitEpoch', 'landing.pods', 'landing.startedAtTSec',
      'landing.terrain', 'landing.window', 'level', 'level.aNominalKmS2', 'level.cruiseWarp', 'level.dvBudgetKmS',
      'level.memoryClass', 'level.planet', 'level.planet.R', 'level.planet.mu', 'level.planet.rAtm', 'level.r0',
      'level.ring', 'level.ring.max', 'level.ring.min', 'level.shipId', 'level.shipName', 'level.shrink',
      'level.shrink.edgeBackOffTac', 'level.shrink.marginMinTac', 'level.shrink.marginTac', 'level.shrink.reactionTac',
      'level.shrink.smallLoopFactor', 'level.tacticalWarp', 'level.zones', 'memory', 'mission', 'mission.colonists',
      'mission.destination', 'mission.shipId', 'mission.transmissionNum', 'mission.unitId', 'mission.wave', 'orbit',
      'orbit.vx', 'orbit.vy', 'orbit.x', 'orbit.y',
    ],
    content: { arm: 1, generator: 2, update: 1, mapState: 1, catalogue: 1 },
  },
  // Slices 4c–4e (one bump for the three): landing.autodrop, burn.auto.holding, run.threat.seedsMetAtDepth; the seed
  // outline's `preempted` and the arrival seeds' `disguise` sit below the pinned depth (RUN_SAVE_MIGRATIONS[3]).
  4: {
    run: [
      'arrival', 'arrival.boarded', 'arrival.card', 'arrival.cardCharge', 'arrival.chargeCarried',
      'arrival.chargeFloorAdded', 'arrival.chargeOverflowLost', 'arrival.deliveries', 'arrival.eccCorrected',
      'arrival.hits', 'arrival.scripted', 'arrival.seeds', 'arrival.skills', 'arrival.starCredit', 'arrival.stars',
      'beamOut', 'coreLost', 'endCause', 'ghostSpoken', 'hollowNamed', 'hollowUnits', 'inbox', 'inbox.read',
      'lastUnit', 'licences', 'log', 'log.autoOpened', 'log.found', 'log.read', 'log.scanned', 'log.toldReading',
      'map', 'map.arm', 'map.armSeed', 'map.galaxyYear', 'map.history', 'map.history.colonies',
      'map.history.departures', 'map.history.finalSerial', 'map.history.gap', 'map.history.lastUnitNumber',
      'map.history.routes', 'map.history.valveYears', 'map.noise', 'map.pendingExtra', 'map.route', 'map.run',
      'map.startYear', 'map.version', 'map.world', 'next', 'pendingStarCredit', 'pendingStars', 'phase',
      'repairRenewedOn', 'repo', 'repo.nextId', 'repo.pick', 'repo.requests', 'rev', 'seed', 'shipIndex', 'ships',
      'ships[].colonistsAboard', 'ships[].colony', 'ships[].depth', 'ships[].fuelLeftPct', 'ships[].landedInLz',
      'ships[].lzs', 'ships[].noGo', 'ships[].notLaunched', 'ships[].offSite', 'ships[].outcome', 'ships[].parked',
      'ships[].pods', 'ships[].points', 'ships[].restored', 'ships[].ringMiss', 'ships[].shipId', 'ships[].shipName',
      'ships[].slot', 'ships[].stars', 'simulationRetryUsed', 'skills', 'skills.announced',
      'skills.announced.autoburn', 'skills.announced.autodrop', 'skills.announced.sentry', 'skills.announced.survey',
      'skills.bought', 'skills.earned', 'skills.grants', 'skills.opened', 'skills.pending', 'skills.skillGrants',
      'stats', 'stats.capRefusals', 'stats.deal', 'stats.deletes', 'stats.demos', 'stats.driversBitten',
      'stats.driversLost', 'stats.dropDemos', 'stats.manualCaptures', 'stats.moves', 'stats.repairs', 'threat',
      'threat.aboard', 'threat.age', 'threat.boardCause', 'threat.boardedAtDepth', 'threat.current',
      'threat.current.boards', 'threat.current.isFinal', 'threat.current.oneHopFromFinal', 'threat.current.stage',
      'threat.eatenDrivers', 'threat.fed', 'threat.lastTally', 'threat.lastTally.fed', 'threat.lastTally.left',
      'threat.lastTally.traceAfter', 'threat.lastTally.traceBefore', 'threat.seedsMetAtDepth', 'threat.stagesPlayed',
      'threat.told', 'threat.told.keepCharge', 'threat.told.noticed', 'threat.trace', 'transit', 'tutorial',
      'unitNumber', 'upgrades', 'wave',
    ],
    slices: [
      'burn', 'burn.acceptOnly', 'burn.auto', 'burn.auto.atAi', 'burn.auto.captured', 'burn.auto.claimed',
      'burn.auto.end', 'burn.auto.flying', 'burn.auto.holding', 'burn.auto.mode', 'burn.auto.phase',
      'burn.auto.targetKm', 'burn.auto.waitingSinceTSec', 'burn.closedIdleAiSec', 'burn.coastAtAi',
      'burn.dvDeliveredKmS', 'burn.firing', 'burn.firingFor', 'burn.firingSource', 'burn.fuelPct', 'burn.ghost',
      'burn.ghostBursts', 'burn.heading', 'burn.lastTickDvKmS', 'burn.lockHoldAiSec', 'burn.missedIdleTac',
      'burn.omega', 'burn.presetAligning', 'burn.rotInput', 'burn.sasMode', 'burn.status', 'burn.thrustPct',
      'burn.thrustTac', 'clock', 'clock.aiSec', 'clock.debugWarp', 'clock.overclock', 'clock.pace', 'clock.paused',
      'clock.skipEndTSec', 'clock.skipWarp', 'clock.skipWaypoint', 'clock.speed', 'clock.speedTarget', 'clock.tSec',
      'hazards', 'hazards.debrisHits', 'hazards.hitIds', 'hollow', 'hollow.biteInSec', 'hollow.bitesAt',
      'hollow.calmAiSec', 'hollow.cfg', 'hollow.cfg.burnMult', 'hollow.cfg.deal', 'hollow.cfg.drainPerSec',
      'hollow.cfg.landMult', 'hollow.cfg.onlySeedsBite', 'hollow.cfg.seed', 'hollow.cfg.spreadEverySec',
      'hollow.cfg.story', 'hollow.cfg.verbs', 'hollow.cfg.wake', 'hollow.deal', 'hollow.deal.entryId',
      'hollow.deal.hasteUntilAi', 'hollow.deal.pauseUntilAi', 'hollow.deal.phase', 'hollow.deal.pod',
      'hollow.deal.segId', 'hollow.deal.startAddr', 'hollow.finale', 'hollow.finale.ending', 'hollow.finale.phase',
      'hollow.finale.restoredHalf', 'hollow.finale.restoredInPlace', 'hollow.finale.unresolvedUntilAi', 'hollow.phase',
      'hollow.scriptTargetId', 'hollow.seedInSec', 'hollow.seedMoments', 'hollow.seedTelegraph', 'hollow.seedsLanded',
      'hollow.story', 'hollow.unlinkedLastSpare', 'hollow.untriedTools', 'hollow.verb', 'hollow.verbInSec',
      'hollow.verbMoments', 'hollow.verbTelegraphs', 'hollow.verbsBlocked', 'hollow.verbsLanded', 'hollow.wakeAtAi',
      'hollow.wakeHeld', 'hollow.wakeHoldEndedAtAi', 'landing', 'landing.autodrop', 'landing.autodrop.armed',
      'landing.autodrop.armedAtTSec', 'landing.autodrop.claimed', 'landing.autodrop.end', 'landing.autodrop.endAtAi',
      'landing.autodrop.flownAs', 'landing.autodrop.held', 'landing.autodrop.pass', 'landing.autodrop.sent',
      'landing.autodrop.waitingSinceTSec', 'landing.bay', 'landing.bay.cadenceLeftTac', 'landing.bay.loaded',
      'landing.bay.reloadTac', 'landing.colony', 'landing.colonyFirstRun', 'landing.decay', 'landing.decay.kicks',
      'landing.decay.last', 'landing.decay.lastKickTSec', 'landing.declined', 'landing.drag', 'landing.ended',
      'landing.finalShip', 'landing.forgiveness', 'landing.fuelAtEndPct', 'landing.ghostBursts', 'landing.goLow',
      'landing.hurt', 'landing.lead', 'landing.lingerAiSec', 'landing.loadNext', 'landing.lzs',
      'landing.noDriverAiSec', 'landing.noGo', 'landing.orbitEpoch', 'landing.pods', 'landing.startedAtTSec',
      'landing.terrain', 'landing.window', 'level', 'level.aNominalKmS2', 'level.cruiseWarp', 'level.dvBudgetKmS',
      'level.memoryClass', 'level.planet', 'level.planet.R', 'level.planet.mu', 'level.planet.rAtm', 'level.r0',
      'level.ring', 'level.ring.max', 'level.ring.min', 'level.shipId', 'level.shipName', 'level.shrink',
      'level.shrink.edgeBackOffTac', 'level.shrink.marginMinTac', 'level.shrink.marginTac', 'level.shrink.reactionTac',
      'level.shrink.smallLoopFactor', 'level.tacticalWarp', 'level.zones', 'memory', 'mission', 'mission.colonists',
      'mission.destination', 'mission.shipId', 'mission.transmissionNum', 'mission.unitId', 'mission.wave', 'orbit',
      'orbit.vx', 'orbit.vy', 'orbit.x', 'orbit.y',
    ],
    content: { arm: 1, generator: 2, update: 1, mapState: 1, catalogue: 1 },
  },
};

const pinned = PINNED[RUN_SAVE_VERSION];
check(`RUN_SAVE_VERSION ${RUN_SAVE_VERSION} has a pinned shape (pin it with AP_PIN_PRINT=1)`, pinned !== undefined);
const missingSteps = Array.from({ length: RUN_SAVE_VERSION - 1 }, (_, i) => i + 1).filter((version) => RUN_SAVE_MIGRATIONS[version] === undefined);
check('every older save version has its migration step (RUN_SAVE_MIGRATIONS)', missingSteps.length === 0, missingSteps.join(', '));
if (pinned !== undefined) {
  const diff = (now: readonly string[], then: readonly string[]): string => {
    const added = now.filter((path) => !then.includes(path));
    const dropped = then.filter((path) => !now.includes(path));
    return [...added.map((path) => `+${path}`), ...dropped.map((path) => `-${path}`)].join(' ');
  };
  const bump = `bump RUN_SAVE_VERSION, add RUN_SAVE_MIGRATIONS[${RUN_SAVE_VERSION}] and pin the new shape`;
  check(`the saved RunState's keys are version ${RUN_SAVE_VERSION}'s (else ${bump})`, diff(shape.run, pinned.run) === '', diff(shape.run, pinned.run));
  check(`each saved ship slice's keys are version ${RUN_SAVE_VERSION}'s (else ${bump})`, diff(shape.slices, pinned.slices) === '', diff(shape.slices, pinned.slices));
  check(`the content versions are version ${RUN_SAVE_VERSION}'s (else ${bump}, or a content change refuses every save in flight)`,
    JSON.stringify(shape.content) === JSON.stringify(pinned.content), `${JSON.stringify(shape.content)} vs ${JSON.stringify(pinned.content)}`);
}
finish();
