import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import { useProfiles } from '@/hooks/use-profiles'
import { setProxyGroupRegex } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { ProxySortType } from './use-filter-sort'

export interface HeadState {
  open?: boolean
  showType: boolean
  sortType: ProxySortType
  filterText: string
  regexFilter: string
  filterMatchCase?: boolean
  filterMatchWholeWord?: boolean
  filterUseRegularExpression?: boolean
  textState: 'url' | 'filter' | null
  testUrl: string
}

type HeadStateStorage = Record<string, Record<string, HeadState>>

const HEAD_STATE_KEY = 'proxy-head-state'
const EMPTY_REGEX_FILTERS: Record<string, string> = {}
export const DEFAULT_STATE: HeadState = {
  open: false,
  showType: true,
  sortType: 0,
  filterText: '',
  regexFilter: '',
  filterMatchCase: false,
  filterMatchWholeWord: false,
  filterUseRegularExpression: false,
  textState: null,
  testUrl: '',
}

type HeadStateAction =
  | { type: 'reset' }
  | { type: 'replace'; payload: Record<string, HeadState> }
  | { type: 'update'; groupName: string; patch: Partial<HeadState> }

function headStateReducer(
  state: Record<string, HeadState>,
  action: HeadStateAction,
): Record<string, HeadState> {
  switch (action.type) {
    case 'reset':
      return {}
    case 'replace':
      return action.payload
    case 'update': {
      const prev = state[action.groupName] || DEFAULT_STATE
      return { ...state, [action.groupName]: { ...prev, ...action.patch } }
    }
    default:
      return state
  }
}

function normalizeHeadStates(
  payload: Record<string, Partial<HeadState>>,
  regexFilters: Record<string, string>,
): Record<string, HeadState> {
  return Object.fromEntries(
    Array.from(
      new Set([...Object.keys(payload), ...Object.keys(regexFilters)]),
    ).map((groupName) => [
      groupName,
      {
        ...DEFAULT_STATE,
        ...payload[groupName],
        regexFilter: regexFilters[groupName] ?? '',
      },
    ]),
  )
}

export function useHeadStateNew() {
  const { profiles, mutateProfiles } = useProfiles()
  const current = profiles?.current || ''
  const regexFilters = useMemo(
    () =>
      profiles?.items?.find((item) => item.uid === current)?.regex_filters ??
      EMPTY_REGEX_FILTERS,
    [current, profiles?.items],
  )

  const [state, dispatch] = useReducer(headStateReducer, {})
  const migratedProfilesRef = useRef(new Set<string>())
  const currentRef = useRef(current)
  currentRef.current = current

  useEffect(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem(HEAD_STATE_KEY)!,
      ) as HeadStateStorage

      const value = data[current] || {}

      if (value && typeof value === 'object') {
        dispatch({
          type: 'replace',
          payload: normalizeHeadStates(value, regexFilters),
        })
        if (current && !migratedProfilesRef.current.has(current)) {
          migratedProfilesRef.current.add(current)
          const legacy = Object.entries(value).filter(
            ([name, saved]) =>
              saved.regexFilter?.trim() && regexFilters[name] === undefined,
          )
          if (legacy.length > 0) {
            void (async () => {
              for (const [name, saved] of legacy) {
                try {
                  const outcome = await setProxyGroupRegex(
                    current,
                    name,
                    saved.regexFilter,
                  )
                  if (outcome.status === 'valid') continue
                  showNotice.error(
                    outcome.status === 'invalid'
                      ? outcome.message
                      : outcome.status,
                  )
                } catch (error) {
                  showNotice.error(error)
                }
                if (currentRef.current === current) {
                  dispatch({
                    type: 'update',
                    groupName: name,
                    patch: { regexFilter: '' },
                  })
                }
              }
              await mutateProfiles()
            })()
          }
        }
      } else {
        dispatch({ type: 'reset' })
      }
    } catch {
      dispatch({
        type: 'replace',
        payload: normalizeHeadStates({}, regexFilters),
      })
    }
  }, [current, mutateProfiles, regexFilters])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const item = localStorage.getItem(HEAD_STATE_KEY)

        let data = (item ? JSON.parse(item) : {}) as HeadStateStorage

        if (!data || typeof data !== 'object') data = {}

        data[current] = state

        localStorage.setItem(HEAD_STATE_KEY, JSON.stringify(data))
      } catch {}
    })

    return () => clearTimeout(timer)
  }, [state, current])

  const setHeadState = useCallback(
    (groupName: string, obj: Partial<HeadState>) => {
      if (obj.regexFilter !== undefined) {
        void setProxyGroupRegex(current, groupName, obj.regexFilter)
          .then((outcome) => {
            if (outcome.status !== 'valid') {
              showNotice.error(
                outcome.status === 'invalid' ? outcome.message : outcome.status,
              )
              return
            }
            if (currentRef.current === current) {
              dispatch({ type: 'update', groupName, patch: obj })
            }
            void mutateProfiles()
          })
          .catch((error) => showNotice.error(error))
        return
      }
      dispatch({ type: 'update', groupName, patch: obj })
    },
    [current, mutateProfiles],
  )

  return [state, setHeadState] as const
}
