const { getWeapon, starterWeapon } = require('./cs-weapon-catalog');
const { initialReserveAmmo } = require('./cs-ground-inventory');
const {
  CS_ECONOMY_RULES,
  clampMoney,
  lossBonus
} = require('./cs-economy-rules');

const BUY_TYPES = Object.freeze(['pistol', 'eco', 'half', 'force', 'full', 'hero']);
const ROLE_PREFERENCES = Object.freeze(['awp', 'entry', 'support', 'lurk', 'anchor']);

function rawName(char) {
  return char?.name || char?.character_name || 'Oyuncu';
}

function equipmentValue(player) {
  const weapon = getWeapon(player.weapon);
  const utilityValue = (player.utility || []).reduce((sum, item) =>
    sum + (CS_ECONOMY_RULES.utility[item] || 0), 0);
  return (weapon?.price || 0)
    + (player.armor > 0
      ? (player.helmet ? CS_ECONOMY_RULES.armor.full : CS_ECONOMY_RULES.armor.kevlar)
      : 0)
    + (player.hasDefuseKit ? CS_ECONOMY_RULES.defuseKit : 0)
    + utilityValue;
}

function hasPrimaryWeapon(player) {
  return !['pistol', 'knife'].includes(getWeapon(player.weapon)?.category);
}

function resetInventory(player, side) {
  const starter = starterWeapon(side);
  player.side = side;
  player.weapon = starter.name;
  player.ammo = starter.magazineSize;
  player.reserveAmmo = initialReserveAmmo(starter);
  player.weaponEntityId = null;
  player.armor = 0;
  player.helmet = false;
  player.hasDefuseKit = false;
  player.utility = [];
  player.savedFromPreviousRound = false;
  player.aliveLastRound = false;
  player.equipmentValue = equipmentValue(player);
}

function createPlayer(char, teamId, index) {
  return {
    id: `cs-${teamId}-${index}`,
    teamId,
    index,
    char,
    name: rawName(char),
    money: CS_ECONOMY_RULES.startMoney,
    side: teamId === 1 ? 'T' : 'CT',
    weapon: teamId === 1 ? 'Glock-18' : 'USP-S',
    ammo: starterWeapon(teamId === 1 ? 'T' : 'CT').magazineSize,
    reserveAmmo: initialReserveAmmo(starterWeapon(teamId === 1 ? 'T' : 'CT')),
    weaponEntityId: null,
    armor: 0,
    helmet: false,
    hasDefuseKit: false,
    utility: [],
    savedFromPreviousRound: false,
    aliveLastRound: false,
    equipmentValue: 0,
    purchasePlan: 'pistol',
    rolePreference: ROLE_PREFERENCES[index] || 'support'
  };
}

class CsEconomyManager {
  constructor({ team1, team2, getRating, rng = Math.random }) {
    this.getRating = getRating;
    this.rng = rng;
    this.teams = {
      1: {
        id: 1,
        lossBonusIndex: 1,
        buyType: 'pistol',
        reasonCodes: ['PISTOL_ROUND'],
        expectedOpponentBuy: 'pistol',
        drops: [],
        players: team1.slice(0, 5).map((char, index) => createPlayer(char, 1, index))
      },
      2: {
        id: 2,
        lossBonusIndex: 1,
        buyType: 'pistol',
        reasonCodes: ['PISTOL_ROUND'],
        expectedOpponentBuy: 'pistol',
        drops: [],
        players: team2.slice(0, 5).map((char, index) => createPlayer(char, 2, index))
      }
    };
    this.assignRoles(this.team(1));
    this.assignRoles(this.team(2));
    this.lastRound = null;
  }

  team(teamId) {
    return this.teams[teamId];
  }

  isHalfStart(round) {
    return round === 1 || round === 13;
  }

  mustSpendRound(round, score1 = 0, score2 = 0) {
    return round === 12
      || round === 24
      || round > 24
      || Math.max(Number(score1) || 0, Number(score2) || 0) >= 12;
  }

  assignRoles(team) {
    const ranked = [...team.players].sort((first, second) =>
      this.getRating(second.char, 'cs') - this.getRating(first.char, 'cs')
    );
    const roleOrder = ['awp', 'entry', 'support', 'lurk', 'anchor'];
    ranked.forEach((player, index) => {
      player.rolePreference = roleOrder[index] || 'support';
    });
  }

  prepareRound({ round, team1Attacker, score1 = 0, score2 = 0 }) {
    const purchases = [];
    const drops = [];
    const sides = {
      1: team1Attacker ? 'T' : 'CT',
      2: team1Attacker ? 'CT' : 'T'
    };

    for (const teamId of [1, 2]) {
      const team = this.team(teamId);
      if (this.isHalfStart(round)) {
        team.lossBonusIndex = 1;
        team.players.forEach(player => {
          player.money = CS_ECONOMY_RULES.startMoney;
          resetInventory(player, sides[teamId]);
        });
      } else {
        team.players.forEach(player => {
          player.side = sides[teamId];
          player.hasDefuseKit = player.side === 'CT' && player.hasDefuseKit;
        });
      }
    }

    for (const teamId of [1, 2]) {
      const team = this.team(teamId);
      const plan = this.chooseBuyPlan({
        team,
        opponent: this.team(teamId === 1 ? 2 : 1),
        isPistol: this.isHalfStart(round),
        mustSpend: this.mustSpendRound(round, score1, score2),
        ownScore: teamId === 1 ? score1 : score2,
        opponentScore: teamId === 1 ? score2 : score1
      });
      team.buyType = plan.buyType;
      team.reasonCodes = plan.reasonCodes;
      team.expectedOpponentBuy = plan.expectedOpponentBuy;
      team.targetBudget = plan.targetBudget;
      team.drops = [];
    }

    for (const teamId of [1, 2]) {
      this.purchaseForTeam(this.team(teamId), purchases, drops);
    }

    const teams = {
      1: this.teamSnapshot(1, purchases, drops),
      2: this.teamSnapshot(2, purchases, drops)
    };
    const roundState = {
      round,
      isPistol: this.isHalfStart(round),
      teams,
      purchases,
      drops,
      purchaseTimeline: purchases.map((purchase, index) => ({
        ...purchase,
        order: index,
        atMs: index * 90
      })),
      loadouts: {
        1: teams[1].players,
        2: teams[2].players
      }
    };
    this.lastRound = roundState;
    return roundState;
  }

  estimateOpponentBuy(opponent, isPistol) {
    if (isPistol) return 'pistol';
    const averageMoney = opponent.players.reduce((sum, player) => sum + player.money, 0)
      / Math.max(1, opponent.players.length);
    const savedPrimaries = opponent.players.filter(player =>
      player.savedFromPreviousRound && hasPrimaryWeapon(player)
    ).length;
    if (savedPrimaries >= 3 || averageMoney >= 3900) return 'full';
    if (averageMoney >= 2700) return 'force';
    if (averageMoney >= 2100) return 'half';
    return 'eco';
  }

  chooseBuyPlan({ team, opponent, isPistol, mustSpend = false, ownScore, opponentScore }) {
    const expectedOpponentBuy = this.estimateOpponentBuy(opponent, isPistol);
    if (isPistol) {
      return {
        buyType: 'pistol',
        reasonCodes: [
          'PISTOL_ROUND',
          team.players[0]?.side === 'CT' ? 'CT_KIT_PRIORITY' : 'T_ENTRY_KEVLAR'
        ],
        expectedOpponentBuy,
        targetBudget: CS_ECONOMY_RULES.startMoney
      };
    }
    const averageMoney = team.players.reduce((sum, player) => sum + player.money, 0)
      / Math.max(1, team.players.length);
    const savedPrimaryCount = team.players.filter(player =>
      player.savedFromPreviousRound
      && hasPrimaryWeapon(player)
    ).length;
    const matchPointPressure = opponentScore >= 12 || ownScore >= 12;
    const side = team.players[0]?.side || 'T';
    const fullThreshold = side === 'CT' ? 4300 : 4000;
    const awper = team.players.find(player => player.rolePreference === 'awp');
    const awpReady = awper?.weapon === 'AWP' || awper?.money >= 5750;
    const reasonCodes = [];
    let buyType = 'eco';

    if (savedPrimaryCount >= 3 && averageMoney >= 800) {
      buyType = 'full';
      reasonCodes.push('SAVED_CORE', 'FULL_UTILITY');
    } else if (savedPrimaryCount === 1 && averageMoney < 2700) {
      buyType = 'hero';
      reasonCodes.push('HERO_WEAPON', 'PLAY_AROUND_SAVED_GUN');
    } else if (averageMoney >= fullThreshold) {
      buyType = 'full';
      reasonCodes.push('FULL_BUY_READY', side === 'CT' ? 'CT_KIT_PRIORITY' : 'T_RIFLE_CORE');
    } else if (mustSpend) {
      buyType = 'force';
      reasonCodes.push('NO_FUTURE_ROUND_FORCE');
    } else if (matchPointPressure && averageMoney >= 1500) {
      buyType = 'force';
      reasonCodes.push('MATCH_POINT_FORCE');
    } else if (averageMoney >= 2850) {
      buyType = 'force';
      reasonCodes.push('FORCE_WITH_LOSS_BONUS');
    } else if (averageMoney >= 2150 || (!awpReady && averageMoney >= 1850)) {
      buyType = 'half';
      reasonCodes.push(!awpReady ? 'SAVE_FOR_AWP' : 'HALF_BUY_NEXT_FULL');
    } else {
      reasonCodes.push('ECO_REBUILD');
    }

    if (expectedOpponentBuy === 'eco' && ['full', 'force'].includes(buyType)) {
      reasonCodes.push('ANTI_ECO_SMG');
    }

    return {
      buyType,
      reasonCodes: [...new Set(reasonCodes)],
      expectedOpponentBuy,
      targetBudget: side === 'CT' ? 4750 : 4450
    };
  }

  chooseBuyType(options) {
    return this.chooseBuyPlan({
      ...options,
      opponent: options.opponent || this.team(options.team.id === 1 ? 2 : 1)
    }).buyType;
  }

  purchaseForTeam(team, purchases, drops = []) {
    const sorted = [...team.players].sort((first, second) =>
      this.getRating(second.char, 'cs') - this.getRating(first.char, 'cs')
    );
    this.coordinateAwpDrop(team, sorted, purchases, drops);
    sorted.forEach((player, order) => {
      player.purchasePlan = team.buyType;
      player.savedFromPreviousRound = Boolean(
        player.savedFromPreviousRound
        && hasPrimaryWeapon(player)
      );
      this.purchasePlayer(player, team.buyType, order, purchases, team);
      player.equipmentValue = equipmentValue(player);
    });
  }

  coordinateAwpDrop(team, sorted, purchases, drops) {
    if (!['full', 'hero'].includes(team.buyType)) return;
    const recipient = sorted.find(player => player.rolePreference === 'awp');
    if (!recipient || hasPrimaryWeapon(recipient) || recipient.money >= 5750) return;
    const awp = getWeapon('AWP');
    const donor = sorted
      .filter(player => player !== recipient && player.money >= awp.price + 1400)
      .sort((first, second) => second.money - first.money)[0];
    if (!donor) return;

    donor.money = clampMoney(donor.money - awp.price);
    recipient.weapon = awp.name;
    recipient.ammo = awp.magazineSize;
    recipient.reserveAmmo = initialReserveAmmo(awp);
    recipient.weaponEntityId = null;
    recipient.savedFromPreviousRound = false;
    const drop = {
      teamId: team.id,
      fromPlayerId: donor.id,
      fromPlayerName: donor.name,
      toPlayerId: recipient.id,
      toPlayerName: recipient.name,
      item: awp.name,
      price: awp.price,
      reasonCode: 'AWP_TEAM_DROP'
    };
    drops.push(drop);
    team.drops.push(drop);
    purchases.push({
      playerId: donor.id,
      teamId: donor.teamId,
      playerName: donor.name,
      recipientId: recipient.id,
      recipientName: recipient.name,
      item: awp.name,
      price: awp.price,
      moneyAfter: donor.money,
      isDrop: true,
      reasonCode: 'AWP_TEAM_DROP'
    });
  }

  purchasePlayer(player, buyType, order, purchases, team = null) {
    const side = player.side;
    const starter = starterWeapon(side);
    if (!player.weapon) player.weapon = starter.name;

    const buy = (item, price, apply) => {
      if (price <= 0 || player.money < price) return false;
      player.money = clampMoney(player.money - price);
      apply();
      purchases.push({
        playerId: player.id,
        teamId: player.teamId,
        playerName: player.name,
        item,
        price,
        moneyAfter: player.money
      });
      return true;
    };

    const buyWeapon = name => {
      const weapon = getWeapon(name);
      if (
        !weapon
        || player.weapon === name
        || (weapon.side !== 'ANY' && weapon.side !== side)
      ) return false;
      return buy(name, weapon.price || 0, () => {
        player.weapon = weapon.name;
        player.ammo = weapon.magazineSize;
        player.reserveAmmo = initialReserveAmmo(weapon);
        player.weaponEntityId = null;
        player.savedFromPreviousRound = false;
      });
    };
    const buyKevlar = withHelmet => {
      if (player.armor >= 100 && (!withHelmet || player.helmet)) return false;
      const price = player.armor > 0 && withHelmet
        ? CS_ECONOMY_RULES.armor.helmetUpgrade
        : (withHelmet ? CS_ECONOMY_RULES.armor.full : CS_ECONOMY_RULES.armor.kevlar);
      return buy(withHelmet ? 'Kevlar + Kask' : 'Kevlar', price, () => {
        player.armor = 100;
        player.helmet = withHelmet;
      });
    };
    const buyKit = () => {
      if (side !== 'CT' || player.hasDefuseKit) return false;
      return buy('Defuse Kit', CS_ECONOMY_RULES.defuseKit, () => {
        player.hasDefuseKit = true;
      });
    };
    const buyUtility = item => {
      const utilityItem = item === 'molotov' && side === 'CT' ? 'incendiary' : item;
      if (player.utility.length >= 4) return false;
      const owned = player.utility.filter(current => current === utilityItem).length;
      if (owned >= (utilityItem === 'flash' ? 2 : 1)) return false;
      const price = CS_ECONOMY_RULES.utility[utilityItem];
      return buy(utilityItem, price, () => player.utility.push(utilityItem));
    };

    if (buyType === 'pistol') {
      if (side === 'CT' && player.rolePreference === 'support') {
        buyKit();
        buyUtility('flash');
      } else if (player.rolePreference === 'entry' || order <= 1) {
        buyKevlar(false);
      } else {
        buyWeapon('P250');
        buyUtility('flash');
      }
      return;
    }

    if (buyType === 'eco') {
      if (order === 0 && player.money >= 2500) buyWeapon('Desert Eagle');
      else if (order >= 3 && player.money >= 2300) buyWeapon('P250');
      return;
    }

    const hasPrimary = hasPrimaryWeapon(player);
    if (!hasPrimary) {
      if (buyType === 'full' || buyType === 'hero') {
        const wantsAwp = player.rolePreference === 'awp'
          && player.money >= 5750
          && this.rng() < 0.62;
        if (wantsAwp) buyWeapon('AWP');
        else if (player.rolePreference === 'awp' && player.money >= 4300) {
          buyWeapon(side === 'CT' ? 'AUG' : 'SG 553');
        } else if (side === 'CT') {
          buyWeapon(
            player.rolePreference === 'entry' && player.money >= 4100
              ? 'M4A4'
              : 'M4A1-S'
          );
        } else {
          buyWeapon('AK-47');
        }
      } else if (buyType === 'force') {
        if (player.rolePreference === 'awp' && player.money >= 2700) {
          buyWeapon('SSG 08');
        } else if (player.rolePreference === 'anchor' && player.money >= 3000) {
          buyWeapon('XM1014');
        } else if (side === 'CT') {
          buyWeapon(player.money >= 2700 ? 'FAMAS' : (player.money >= 2200 ? 'MP9' : 'UMP-45'));
        } else {
          buyWeapon(player.money >= 2450 ? 'Galil AR' : (player.money >= 2100 ? 'MAC-10' : 'UMP-45'));
        }
        if (!hasPrimaryWeapon(player) && player.money >= 300) buyWeapon('P250');
      } else if (buyType === 'half') {
        if (
          team?.expectedOpponentBuy === 'eco'
          && player.rolePreference === 'anchor'
          && player.money >= 2850
        ) {
          buyWeapon('Nova');
        } else if (player.money >= 3200) {
          buyWeapon(side === 'CT' ? 'MP9' : 'MAC-10');
        } else if (player.money >= 2700) {
          buyWeapon(side === 'CT' ? 'Five-SeveN' : 'Tec-9');
        } else if (player.money >= 2450 && order === 0) {
          buyWeapon('Desert Eagle');
        } else {
          buyWeapon('P250');
        }
      }
    }

    if (buyType === 'full' || buyType === 'hero') {
      buyKevlar(true);
      if (
        side === 'CT'
        && (player.rolePreference === 'support' || player.rolePreference === 'anchor')
      ) buyKit();
      buyUtility('smoke');
      buyUtility('flash');
      if (player.rolePreference === 'support') buyUtility('flash');
      if (player.money >= 600) {
        buyUtility(
          ['entry', 'anchor'].includes(player.rolePreference) ? 'molotov' : 'he'
        );
      }
    } else if (buyType === 'force') {
      buyKevlar(player.money >= 1200);
      if (side === 'CT' && player.rolePreference === 'support') buyKit();
      if (player.money >= 800) buyUtility('smoke');
      if (player.money >= 500) buyUtility('flash');
    } else if (buyType === 'half') {
      if (player.money >= 2500) buyKevlar(false);
      if (player.money >= 2300) buyUtility('flash');
    }
  }

  finalizeRound({
    winnerTeamId,
    reason,
    planted,
    planterChar,
    events,
    remainingPlayers
  }) {
    const loserTeamId = winnerTeamId === 1 ? 2 : 1;
    const moneyBefore = {
      1: this.team(1).players.map(player => player.money),
      2: this.team(2).players.map(player => player.money)
    };
    const remainingById = new Map((remainingPlayers || []).map(player => [player.id, player]));

    for (const teamId of [1, 2]) {
      const team = this.team(teamId);
      team.players.forEach(player => {
        const finalState = remainingById.get(player.id);
        if (finalState?.alive) {
          player.aliveLastRound = true;
          player.savedFromPreviousRound = !['pistol', 'knife']
            .includes(getWeapon(finalState.weapon)?.category);
          player.weapon = finalState.weapon;
          player.ammo = Math.max(0, Math.round(finalState.ammo ?? getWeapon(finalState.weapon).magazineSize));
          player.reserveAmmo = Math.max(
            0,
            Math.round(finalState.reserveAmmo ?? initialReserveAmmo(finalState.weapon))
          );
          player.weaponEntityId = finalState.weaponEntityId || null;
          player.armor = Math.max(0, Math.round(finalState.armor || 0));
          player.helmet = Boolean(finalState.helmet);
          player.hasDefuseKit = player.side === 'CT' && Boolean(finalState.hasDefuseKit);
          player.utility = [...(finalState.utility || [])];
        } else {
          resetInventory(player, player.side);
        }
      });
    }

    let ctEliminations = 0;
    for (const event of events || []) {
      if (event.kind !== 'kill') continue;
      const killer = this.team(event.teamId).players.find(player => player.char === event.killer);
      if (!killer) continue;
      const reward = getWeapon(event.visual?.combat?.weapon)?.killReward || 300;
      killer.money = clampMoney(killer.money + reward);
      if (killer.side === 'CT') ctEliminations += 1;
    }
    if (ctEliminations > 0) {
      const ctTeam = [this.team(1), this.team(2)]
        .find(team => team.players[0]?.side === 'CT');
      const sharedAward = ctEliminations * CS_ECONOMY_RULES.ctSharedKillReward;
      ctTeam?.players.forEach(player => {
        player.money = clampMoney(player.money + sharedAward);
      });
    }

    const winAward = reason === 'bomb-exploded'
      ? CS_ECONOMY_RULES.bombExplosionWin
      : CS_ECONOMY_RULES.roundWin;
    this.team(winnerTeamId).players.forEach(player => {
      player.money = clampMoney(player.money + winAward);
    });

    const loser = this.team(loserTeamId);
    const loserAward = lossBonus(loser.lossBonusIndex);
    const plantingTeamId = planterChar
      ? ([1, 2].find(teamId =>
          this.team(teamId).players.some(player => player.char === planterChar)
        ) || null)
      : null;
    const plantedLoss = Boolean(planted && plantingTeamId === loserTeamId);
    loser.players.forEach(player => {
      player.money = clampMoney(
        player.money + loserAward + (plantedLoss ? CS_ECONOMY_RULES.plantLossBonus : 0)
      );
    });
    this.team(winnerTeamId).lossBonusIndex = 1;
    loser.lossBonusIndex = Math.min(
      CS_ECONOMY_RULES.lossBonuses.length - 1,
      loser.lossBonusIndex + 1
    );

    if (planterChar) {
      const planter = this.team(loserTeamId).players.find(player => player.char === planterChar)
        || this.team(winnerTeamId).players.find(player => player.char === planterChar);
      if (planter) {
        planter.money = clampMoney(planter.money + CS_ECONOMY_RULES.plantPersonalReward);
      }
    }
    if (reason === 'defused') {
      const defuseEvent = (events || []).find(event => event.kind === 'defuse');
      const defuser = defuseEvent
        ? this.team(winnerTeamId).players.find(player => player.char === defuseEvent.actor)
        : null;
      if (defuser) {
        defuser.money = clampMoney(defuser.money + CS_ECONOMY_RULES.defusePersonalReward);
      }
    }

    for (const teamId of [1, 2]) {
      this.team(teamId).players.forEach(player => {
        player.equipmentValue = equipmentValue(player);
      });
    }

    return {
      winnerTeamId,
      loserTeamId,
      reason,
      planted: Boolean(planted),
      awards: {
        winner: winAward,
        loser: loserAward,
        plantLoss: plantedLoss ? CS_ECONOMY_RULES.plantLossBonus : 0,
        ctSharedKillReward: ctEliminations * CS_ECONOMY_RULES.ctSharedKillReward,
        ctEliminations
      },
      moneyBefore,
      teams: {
        1: this.teamSnapshot(1),
        2: this.teamSnapshot(2)
      }
    };
  }

  teamSnapshot(teamId, purchases = [], drops = []) {
    const team = this.team(teamId);
    const players = team.players.map(player => ({
      id: player.id,
      teamId: player.teamId,
      name: player.name,
      side: player.side,
      money: player.money,
      weapon: player.weapon,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      weaponEntityId: player.weaponEntityId || null,
      armor: player.armor,
      helmet: player.helmet,
      hasDefuseKit: player.hasDefuseKit,
      utility: [...player.utility],
      savedFromPreviousRound: player.savedFromPreviousRound,
      equipmentValue: equipmentValue(player),
      buyType: team.buyType,
      purchasePlan: player.purchasePlan,
      rolePreference: player.rolePreference
    }));
    return {
      teamId,
      side: players[0]?.side || 'T',
      buyType: team.buyType,
      reasonCodes: [...(team.reasonCodes || [])],
      expectedOpponentBuy: team.expectedOpponentBuy || 'unknown',
      targetBudget: team.targetBudget || 0,
      lossBonusIndex: team.lossBonusIndex,
      teamMoney: players.reduce((sum, player) => sum + player.money, 0),
      teamEquipmentValue: players.reduce((sum, player) => sum + player.equipmentValue, 0),
      teamSpend: purchases
        .filter(purchase => purchase.teamId === teamId)
        .reduce((sum, purchase) => sum + purchase.price, 0),
      purchaseCount: purchases.filter(purchase => purchase.teamId === teamId).length,
      drops: drops.filter(drop => drop.teamId === teamId),
      players
    };
  }
}

function createCsEconomyManager(options) {
  return new CsEconomyManager(options);
}

module.exports = {
  BUY_TYPES,
  ROLE_PREFERENCES,
  equipmentValue,
  createCsEconomyManager
};
