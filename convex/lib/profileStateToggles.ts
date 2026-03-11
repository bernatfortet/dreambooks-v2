export type ProfileTimestampStateSnapshot<TField extends string> = Partial<Record<TField, number>> | null

export type ProfileTimestampStateMutationPlan<TField extends string> =
  | {
      operation: 'delete'
    }
  | {
      operation: 'upsert'
      value: Partial<Record<TField, number>> & {
        updatedAt: number
      }
    }

export function getToggledTimestampState<TField extends string>(args: {
  currentState: ProfileTimestampStateSnapshot<TField>
  field: TField
  now: number
  supportedFields: readonly TField[]
}): ProfileTimestampStateMutationPlan<TField> {
  const nextState: Partial<Record<TField, number>> = {}

  for (const supportedField of args.supportedFields) {
    const existingValue = args.currentState?.[supportedField]
    if (existingValue !== undefined) {
      nextState[supportedField] = existingValue
    }
  }

  if (nextState[args.field] !== undefined) {
    delete nextState[args.field]
  } else {
    nextState[args.field] = args.now
  }

  const hasAnyActiveField = args.supportedFields.some((supportedField) => nextState[supportedField] !== undefined)
  if (!hasAnyActiveField) {
    return {
      operation: 'delete',
    }
  }

  return {
    operation: 'upsert',
    value: {
      ...nextState,
      updatedAt: args.now,
    },
  }
}
