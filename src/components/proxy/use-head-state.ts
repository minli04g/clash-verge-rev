import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import { useProfiles } from '@/hooks/use-profiles'
import { setProxyGroupRegex } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  profileTestUrls,
  commitProfileTestUrl,
} from '@/services/proxy-test-url'

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
  | { type: 'reset'; profile: string }
  | { type: 'replace'; profile: string; payload: Record<string, HeadState> }
  | { type: 'update'; groupName: string; patch: Partial<HeadState> }
  | {
      type: 'urls'
      urls: Record<string, string>
      regexFilters: Record<string, string>
    }

interface LoadedHeadState {
  profile: string | null
  heads: Record<string, HeadState>
}

function headStateReducer(
  state: LoadedHeadState,
  action: HeadStateAction,
): LoadedHeadState {
  switch (action.type) {
    case 'reset':
      return { profile: action.profile, heads: {} }
    case 'replace':
      return { profile: action.profile, heads: action.payload }
    case 'urls': {
      let heads = state.heads
      for (const [name, testUrl] of Object.entries(action.urls)) {
        if (heads[name]?.testUrl === testUrl) continue
        heads = {
          ...heads,
          [name]: { ...DEFAULT_STATE, ...heads[name], testUrl },
        }
      }
      for (const name of new Set([
        ...Object.keys(heads),
        ...Object.keys(action.regexFilters),
      ])) {
        const regexFilter = action.regexFilters[name] ?? ''
        if (heads[name]?.regexFilter === regexFilter) continue
        heads = {
          ...heads,
          [name]: { ...DEFAULT_STATE, ...heads[name], regexFilter },
        }
      }
      return heads === state.heads ? state : { ...state, heads }
    }
    case 'update': {
      const prev = state.heads[action.groupName] || DEFAULT_STATE
      return {
        ...state,
        heads: {
          ...state.heads,
          [action.groupName]: { ...prev, ...action.patch },
        },
      }
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
  const { profiles, mutateProfiles, current: profile } = useProfiles()
  const current = profiles?.current || ''
  const regexFilters = useMemo(
    () =>
      profiles?.items?.find((item) => item.uid === current)?.regex_filters ??
      EMPTY_REGEX_FILTERS,
    [current, profiles?.items],
  )

  const [{ profile: loadedProfile, heads: state }, dispatch] = useReducer(
    headStateReducer,
    { profile: null, heads: {} },
  )
  const migratedProfilesRef = useRef(new Set<string>())
  const currentRef = useRef(current)
  currentRef.current = current

  useEffect(() => {
    const urls = profile ? profileTestUrls(profile) : {}
    if (loadedProfile === current) {
      dispatch({ type: 'urls', urls, regexFilters })
      return
    }
    try {
      const data = JSON.parse(
        localStorage.getItem(HEAD_STATE_KEY) || '{}',
      ) as HeadStateStorage

      const value = data?.[current] || {}
      for (const [name, testUrl] of Object.entries(urls)) {
        value[name] = { ...DEFAULT_STATE, ...value[name], testUrl }
      }

      if (value && typeof value === 'object') {
        dispatch({
          type: 'replace',
          profile: current,
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
        dispatch({ type: 'reset', profile: current })
      }
    } catch {
      dispatch({
        type: 'replace',
        profile: current,
        payload: normalizeHeadStates({}, regexFilters),
      })
    }
  }, [current, loadedProfile, profile, mutateProfiles, regexFilters])

  useEffect(() => {
    if (loadedProfile !== current) return
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
  }, [state, current, loadedProfile])

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
      if (current && obj.testUrl !== undefined) {
        void commitProfileTestUrl(current, groupName, obj.testUrl)
      }
    },
    [current, mutateProfiles],
  )

  return [state, setHeadState] as const
}
