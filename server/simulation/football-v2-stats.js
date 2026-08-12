function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function createTeamStats(teamId, name) {
  return {
    teamId,
    name,
    possession: 0,
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    xg: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    passAccuracy: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    defensiveActions: 0,
    corners: 0,
    throwIns: 0,
    goalKicks: 0,
    freeKicks: 0,
    penalties: 0,
    foulsCommitted: 0,
    foulsWon: 0
  };
}

function createPlayerStats(player) {
  return {
    playerId: player.id,
    teamId: player.teamId,
    name: player.name,
    positionCode: player.positionCode,
    isGoalkeeper: player.isGoalkeeper,
    rating: 6.5,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    xa: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    passAccuracy: 0,
    keyPasses: 0,
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    tackles: 0,
    interceptions: 0,
    blocks: 0,
    saves: 0,
    keeperClaims: 0,
    goalsConceded: 0,
    foulsCommitted: 0,
    foulsWon: 0,
    penaltiesTaken: 0,
    penaltiesScored: 0,
    turnovers: 0
  };
}

function calculatePlayerRating(player) {
  const missedPasses = player.passesAttempted - player.passesCompleted;
  const failedDribbles = player.dribblesAttempted - player.dribblesCompleted;
  const attacking =
    player.goals * 1.18 +
    player.assists * 0.72 +
    player.shotsOnTarget * 0.1 +
    (player.goals - player.xg) * 0.34;
  const distribution =
    player.passesCompleted * 0.014 -
    missedPasses * 0.018 +
    player.keyPasses * 0.16 +
    player.xa * 0.34;
  const ballUse =
    player.dribblesCompleted * 0.08 -
    failedDribbles * 0.045 -
    player.turnovers * 0.035;
  const defending =
    player.tackles * 0.11 +
    player.interceptions * 0.12 +
    player.blocks * 0.1 +
    player.saves * 0.15 +
    player.keeperClaims * 0.04 -
    player.goalsConceded * 0.13;
  const discipline =
    player.foulsWon * 0.025 -
    player.foulsCommitted * 0.09 +
    player.penaltiesScored * 0.16 -
    Math.max(0, player.penaltiesTaken - player.penaltiesScored) * 0.42;
  return {
    rating: round(clamp(6.5 + attacking + distribution + ballUse + defending + discipline, 3, 10), 1),
    breakdown: {
      attacking: round(attacking),
      distribution: round(distribution),
      ballUse: round(ballUse),
      defending: round(defending),
      discipline: round(discipline)
    }
  };
}

function buildCommentary(events) {
  const meaningfulTypes = new Set([
    'shot',
    'goal',
    'save',
    'keeper-claim',
    'parry',
    'block',
    'woodwork',
    'miss',
    'foul',
    'free-kick',
    'penalty',
    'corner',
    'throw-in',
    'goal-kick',
    'kickoff',
    'restart-taken',
    'interception',
    'dribble-beat',
    'dribble-tackle'
  ]);
  return events
    .filter(event => meaningfulTypes.has(event.type))
    .map((event, index) => ({
      id: index + 1,
      t: event.t,
      type: event.type,
      teamId: event.teamId,
      score1: event.score1,
      score2: event.score2,
      text: event.text
    }));
}

function buildFootballV2Stats({ players, teams, events, snapshots }) {
  const teamStats = new Map(teams.map(team => [team.id, createTeamStats(team.id, team.name)]));
  const playerStats = new Map(players.map(player => [player.id, createPlayerStats(player)]));
  const playerById = new Map(players.map(player => [player.id, player]));
  const lastCompletedPass = new Map();
  const lastShot = new Map();

  snapshots.forEach(snapshot => {
    const team = teamStats.get(snapshot.possessionTeam);
    if (team) team.possession += 1;
  });
  const possessionSamples = snapshots.length || 1;
  teamStats.forEach(team => {
    team.possession = round((team.possession / possessionSamples) * 100, 1);
  });

  events.forEach(event => {
    const team = teamStats.get(event.teamId);
    const actor = playerStats.get(event.actor);

    if (event.type === 'pass' || event.type === 'keeper-distribution') {
      if (team) team.passesAttempted += 1;
      if (actor) actor.passesAttempted += 1;
    }

    if (event.type === 'first-touch' && event.passerId) {
      const passer = playerStats.get(event.passerId);
      const passerTeam = passer ? teamStats.get(passer.teamId) : null;
      if (passer) passer.passesCompleted += 1;
      if (passerTeam) passerTeam.passesCompleted += 1;
      if (passer) {
        lastCompletedPass.set(passer.teamId, {
          passerId: passer.playerId,
          receiverId: event.actor,
          t: event.t
        });
      }
    }

    if (event.type === 'shot') {
      if (team) {
        team.shots += 1;
        team.xg += Number(event.xg) || 0;
      }
      if (actor) {
        actor.shots += 1;
        actor.xg += Number(event.xg) || 0;
        if (event.isPenalty) actor.penaltiesTaken += 1;
      }
      const previousPass = lastCompletedPass.get(event.teamId);
      const assistedBy = previousPass && event.t - previousPass.t <= 8
        ? previousPass.passerId
        : null;
      if (assistedBy && assistedBy !== event.actor) {
        const creator = playerStats.get(assistedBy);
        if (creator) {
          creator.keyPasses += 1;
          creator.xa += Number(event.xg) || 0;
        }
      }
      lastShot.set(event.teamId, {
        shooterId: event.actor,
        assisterId: assistedBy,
        xg: Number(event.xg) || 0,
        isPenalty: Boolean(event.isPenalty),
        t: event.t
      });
    }

    if (event.type === 'goal') {
      const shot = lastShot.get(event.teamId);
      const shooter = playerStats.get(event.actor || shot?.shooterId);
      if (team) {
        team.goals += 1;
        team.shotsOnTarget += 1;
      }
      if (shooter) {
        shooter.goals += 1;
        shooter.shotsOnTarget += 1;
        if (shot?.isPenalty) shooter.penaltiesScored += 1;
      }
      if (shot?.assisterId && shot.assisterId !== shooter?.playerId && !shot.isPenalty) {
        const assister = playerStats.get(shot.assisterId);
        if (assister) assister.assists += 1;
      }
      const concedingKeeper = players.find(
        player => player.teamId !== event.teamId && player.isGoalkeeper
      );
      const keeperStats = concedingKeeper ? playerStats.get(concedingKeeper.id) : null;
      if (keeperStats) keeperStats.goalsConceded += 1;
    }

    if (event.type === 'save' || (event.type === 'parry' && event.onTarget)) {
      const shot = lastShot.get(event.teamId === 1 ? 2 : 1);
      const shooter = playerStats.get(event.shooter || shot?.shooterId);
      const attackingTeam = shooter ? teamStats.get(shooter.teamId) : null;
      if (shooter) shooter.shotsOnTarget += 1;
      if (attackingTeam) attackingTeam.shotsOnTarget += 1;
      if (actor) actor.saves += 1;
    }

    if (event.type === 'keeper-claim' && actor) actor.keeperClaims += 1;
    if (event.type === 'block' && actor) {
      actor.blocks += 1;
      const defendingTeam = teamStats.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'interception' && actor) {
      actor.interceptions += 1;
      const defendingTeam = teamStats.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'dribble-tackle' && actor) {
      actor.tackles += 1;
      const defendingTeam = teamStats.get(actor.teamId);
      if (defendingTeam) defendingTeam.defensiveActions += 1;
    }
    if (event.type === 'dribble-beat') {
      if (team) team.dribblesAttempted += 1;
      if (team) team.dribblesCompleted += 1;
      if (actor) actor.dribblesAttempted += 1;
      if (actor) actor.dribblesCompleted += 1;
    }
    if (event.type === 'dribble-tackle' || event.type === 'shoulder-duel') {
      const dribbler = playerStats.get(event.victim);
      const dribblingTeam = dribbler ? teamStats.get(dribbler.teamId) : null;
      if (dribbler) dribbler.dribblesAttempted += 1;
      if (dribblingTeam) dribblingTeam.dribblesAttempted += 1;
    }
    if (['interception', 'dribble-tackle', 'heavy-touch', 'overhit'].includes(event.type)) {
      const losingPlayer = playerStats.get(event.passerId || event.victim || event.actor);
      if (losingPlayer && ['heavy-touch', 'overhit'].includes(event.type)) losingPlayer.turnovers += 1;
    }

    if (event.type === 'foul') {
      const offender = playerStats.get(event.actor);
      const victim = playerStats.get(event.victim);
      const offenderTeam = offender ? teamStats.get(offender.teamId) : null;
      const awardedTeam = teamStats.get(event.awardedTeamId);
      if (offender) offender.foulsCommitted += 1;
      if (victim) victim.foulsWon += 1;
      if (offenderTeam) offenderTeam.foulsCommitted += 1;
      if (awardedTeam) awardedTeam.foulsWon += 1;
    }

    if (event.type === 'corner' && team) team.corners += 1;
    if (event.type === 'throw-in' && team) team.throwIns += 1;
    if (event.type === 'goal-kick' && team) team.goalKicks += 1;
    if (event.type === 'free-kick' && team) team.freeKicks += 1;
    if (event.type === 'penalty' && team) team.penalties += 1;
  });

  teamStats.forEach(team => {
    team.xg = round(team.xg, 2);
    team.passAccuracy = team.passesAttempted
      ? round((team.passesCompleted / team.passesAttempted) * 100, 1)
      : 0;
  });
  playerStats.forEach(player => {
    player.xg = round(player.xg, 2);
    player.xa = round(player.xa, 2);
    player.passAccuracy = player.passesAttempted
      ? round((player.passesCompleted / player.passesAttempted) * 100, 1)
      : 0;
    const calculated = calculatePlayerRating(player);
    player.rating = calculated.rating;
    player.ratingBreakdown = calculated.breakdown;
  });

  return {
    teams: [...teamStats.values()],
    players: [...playerStats.values()].sort((left, right) => (
      right.rating - left.rating ||
      right.goals - left.goals ||
      left.name.localeCompare(right.name, 'tr')
    )),
    commentary: buildCommentary(events),
    leaders: [...playerStats.values()]
      .filter(player => !playerById.get(player.playerId)?.isBot || player.isGoalkeeper)
      .sort((left, right) => right.rating - left.rating)
      .slice(0, 3)
      .map(player => ({
        playerId: player.playerId,
        name: player.name,
        teamId: player.teamId,
        rating: player.rating
      }))
  };
}

module.exports = {
  buildFootballV2Stats
};
