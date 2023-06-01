import {
	HERMIT_CARDS,
	EFFECT_CARDS,
	SINGLE_USE_CARDS,
} from '../../../common/cards'
import STRENGTHS from '../../const/strengths'
import {AttackModel} from '../../models/attack-model'
import {GameModel} from '../../models/game-model'
import {applySingleUse, discardCard} from '../../utils'

/**
 * @typedef {import("redux-saga").SagaIterator} SagaIterator
 * @typedef {import('common/types/attack').HermitAttackType} HermitAttackType
 * @typedef {import('common/types/attack').AttackResult} AttackResult
 * @typedef {import('common/types/game-state').RowStateWithHermit} RowStateWithHermit
 */

export const ATTACK_TO_ACTION = {
	primary: 'PRIMARY_ATTACK',
	secondary: 'SECONDARY_ATTACK',
	zero: 'ZERO_ATTACK',
}

export const WEAKNESS_DAMAGE = 20

/**
 *
 * @param {GameModel} game
 * @param {RowStateWithHermit} attackRow
 * @param {HermitAttackType} hermitAttackType
 * @param {import('common/types/pick-process').PickedCardsInfo} pickedCards
 * @returns {Array<AttackModel>}
 */
function getAttacks(game, attackRow, hermitAttackType, pickedCards) {
	const {currentPlayer} = game.ds
	const attacks = []

	// hermit attacks
	const hermitCard = HERMIT_CARDS[attackRow.hermitCard.cardId]
	attacks.push(
		...hermitCard.getAttacks(
			game,
			attackRow.hermitCard.cardInstance,
			hermitAttackType,
			pickedCards
		)
	)

	// all other attacks
	const otherAttacks = Object.values(currentPlayer.hooks.getAttacks)
	for (let i = 0; i < otherAttacks.length; i++) {
		attacks.push(...otherAttacks[i]())
	}

	// @TODO Weakness attack
	//const weaknessAttack = new AttackModel(
	//	{index: attackIndex, row: attackRow},
	//	{index: defenceIndex, row: defenceRow},
	//	'weakness'
	//)

	return attacks
}

/**
 *
 * @param {GameModel} game
 * @param {AttackModel} attack
 * @returns {AttackResult}
 */
function executeAttack(game, attack) {
	const {target, damage, damageMultiplier, defence} = attack

	// Calculate damage
	const initialDamage = damage * damageMultiplier
	const finalDamage = Math.max(initialDamage - defence.damageReduction, 0)

	const {row: targetRow} = target
	const targetHermitInfo = HERMIT_CARDS[targetRow.hermitCard.cardId]

	const currentHealth = targetRow.health
	const maxHealth = targetHermitInfo.health

	// Deduct and clamp health
	const newHealth = Math.max(currentHealth - finalDamage, 0)
	targetRow.health = Math.min(newHealth, maxHealth)

	/** @type {AttackResult} */
	const result = {
		attack,
		totalDamage: currentHealth - newHealth,
		blockedDamage: initialDamage - finalDamage,
	}

	// Attack result
	return result
}

/**
 * @param {GameModel} game
 * @param {TurnAction} turnAction
 * @param {ActionState} actionState
 * @return {SagaIterator}
 */
function* attackSaga(game, turnAction, actionState) {
	// defining things
	const {currentPlayer, opponentPlayer} = game.ds

	//@TODO we are currently doing nothing with picked cards
	const {pickedCardsInfo} = actionState

	/** @type {HermitAttackType} */
	const hermitAttackType = turnAction.payload.type

	if (!hermitAttackType) {
		console.log('Unknown attack type: ', hermitAttackType)
		return 'INVALID'
	}
	// TODO - send hermitCard from frontend for validation?

	// Attacker
	const playerBoard = currentPlayer.board
	const attackIndex = playerBoard.activeRow
	if (!attackIndex) return 'INVALID'

	const attackRow = playerBoard.rows[attackIndex]
	if (!attackRow.hermitCard) return 'INVALID'

	// Defender
	const opponentBoard = opponentPlayer.board
	const defenceIndex = opponentBoard.activeRow
	if (!defenceIndex) return 'INVALID'

	const defenceRow = opponentBoard.rows[defenceIndex]
	if (!defenceRow.hermitCard) return 'INVALID'

	// Get initial attacks
	/** @type {Array<AttackModel>} */
	let attacks = getAttacks(game, attackRow, hermitAttackType, pickedCardsInfo)

	console.log('We got', attacks.length, 'attacks')

	// Main attack loop
	while (attacks.length > 0) {
		/** @type {Array<AttackModel>} */
		const nextAttacks = []

		// Process all current attacks one at a time
		for (let i = 0; i < attacks.length; i++) {
			const attack = attacks[i]

			console.log('Attack start! Type:', attack.type)

			// Call before attack functions
			const beforeAttacks = Object.values(currentPlayer.hooks.beforeAttack)
			for (let i = 0; i < beforeAttacks.length; i++) {
				beforeAttacks[i](attack)
			}

			// Call on attack functions
			const onAttacks = Object.values(currentPlayer.hooks.onAttack)
			for (let i = 0; i < onAttacks.length; i++) {
				onAttacks[i](attack, pickedCardsInfo)
			}
			console.log('- attack code run', attack.damage)

			// Execute attack
			const result = executeAttack(game, attack)

			const afterAttacks = Object.values(currentPlayer.hooks.afterAttack)
			for (let i = 0; i < afterAttacks.length; i++) {
				afterAttacks[i](result)
			}

			nextAttacks.push(...attack.nextAttacks)
		}

		// Loop round, doing everything again with our next set of attacks
		attacks = nextAttacks
	}

	return 'DONE'
}

export default attackSaga
