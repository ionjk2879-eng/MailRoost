import { useEffect, useRef, useState } from "react"
import {
  bulkDeleteMails,
  bulkMarkRead,
  bulkToggleStar,
  emptyAllTrash,
  emptyTrash,
  fetchAccounts,
  fetchFolderMails,
  fetchMails,
  fetchMailsByFilter,
  fetchTrashMails,
  markAllMailsRead,
  markAsRead,
  markAsUnread,
  moveMails,
  permanentDeleteFromTrash,
  reorderAccounts as apiReorderAccounts,
  restoreFromTrash,
  searchMails,
  toggleMailFolder,
  toggleStar,
  updateAccountSignature,
} from "@/lib/api"
import { getSoundPreference, notifyNewMail, playNotificationSound } from "@/lib/push"
import { ARCHIVE_FOLDER_ID } from "@/types/mail"
import type { Account, Mail } from "@/types/mail"
import { usePolling } from "@/hooks/use-polling"

// App.tsx가 화면 전환(view)/분류 메일함 선택(selectedFolderId)의 소유권을 갖고 있어서, 이 훅은
// 그 값을 읽기 전용 입력으로 받는다. 여기 정의해서 App.tsx가 import해서 쓴다 — 값 자체는
// 네비게이션 개념이지만, 이 훅 안의 여러 핸들러(handleDeleteMail, handleManualRefresh 등)가
// 이 타입에 의존하기 때문에 타입 순환 import를 피하려고 여기서 export한다.
export type AppView = "home" | "inbox" | "starred" | "cleanup" | "trash" | "folder" | "archive" | "memo" | "drafts" | "snoozed" | "muted" | "attachments"

// 캐시 미스일 때 매번 새 배열 리터럴([])을 리턴하면 참조가 매 렌더링마다 바뀌어서, 이 값에
// 의존하는 useEffect들이 불필요하게 다시 실행된다 — 안정적인 참조 하나를 재사용한다.
const EMPTY_MAILS: Mail[] = []

function groupIdsByAccount(mails: Mail[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const mail of mails) {
    const ids = map.get(mail.accountId)
    if (ids) ids.push(mail.id)
    else map.set(mail.accountId, [mail.id])
  }
  return map
}

export type BulkSelectFilter = "all" | "none" | "read" | "unread" | "starred" | "unstarred"

// "전체 선택" 모드에서 실제로 서버 전체를 대상으로 삼을 수 있는 필터 (all/none은 의미가 없어 제외).
export type FilterSelectAllFilter = Exclude<BulkSelectFilter, "all" | "none">

interface UseMailWorkspaceParams {
  currentUser: { id: string; email: string } | null
  view: AppView
  selectedFolderId: string | null
  showError: (message: string) => void
}

// 계정, 메일 목록/캐시/페이지네이션, 폴링, 메일 선택/일괄 작업을 소유하는 "큰" 훅.
// 스누즈/뮤트/필터처럼 mail-org 쪽 상태가 필요한 계산(visibleMails 등)은 순환 의존을 피하려고
// 일부러 여기 넣지 않고 App.tsx에서 이 훅과 useMailOrg의 결과를 합쳐서 계산한다.
export function useMailWorkspace({ currentUser, view, selectedFolderId, showError }: UseMailWorkspaceParams) {
  const [realAccounts, setRealAccounts] = useState<Account[]>([])
  const [failedAccountIds, setFailedAccountIds] = useState<string[]>([])
  const [realMails, setRealMails] = useState<Mail[]>([])
  const [mailDetails, setMailDetails] = useState<Record<string, Mail>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const [trashMails, setTrashMails] = useState<Mail[]>([])
  const [trashCursor, setTrashCursor] = useState<string | null>(null)
  const [isTrashLoading, setIsTrashLoading] = useState(false)
  const [isTrashLoadingMore, setIsTrashLoadingMore] = useState(false)

  // folderId별로 캐싱해둬서, 이미 열어본 분류 메일함/보관함으로 다시 전환할 때 네트워크 왕복 없이 바로 보여준다.
  const [folderMailsCache, setFolderMailsCache] = useState<Record<string, Mail[]>>({})
  const folderMails = selectedFolderId ? (folderMailsCache[selectedFolderId] ?? EMPTY_MAILS) : EMPTY_MAILS
  const setFolderMails = (updater: Mail[] | ((prev: Mail[]) => Mail[])) => {
    if (!selectedFolderId) return
    setFolderMailsCache((prev) => {
      const current = prev[selectedFolderId] ?? []
      const next = typeof updater === "function" ? (updater as (p: Mail[]) => Mail[])(current) : updater
      return { ...prev, [selectedFolderId]: next }
    })
  }
  const [isFolderLoading, setIsFolderLoading] = useState(false)

  const [serverSearchResults, setServerSearchResults] = useState<Mail[] | null>(null)
  const [isServerSearching, setIsServerSearching] = useState(false)
  const searchGenerationRef = useRef(0)
  const [searchQuery, setSearchQuery] = useState("")

  const [checkedMailIds, setCheckedMailIds] = useState<Set<string>>(new Set())
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  // 체크박스로 낱개 선택하는 대신, "지금 로드된 페이지와 무관하게 이 조건에 맞는 받은편지함
  // 전체"를 일괄 작업 대상으로 삼는 모드. 실제 대상 목록은 여기 저장하지 않고, 일괄 작업
  // 버튼을 누르는 시점에 서버에서 조회한다 (수천 건을 미리 다 불러와 화면에 그리지 않기 위함).
  const [filterSelectAll, setFilterSelectAll] = useState<FilterSelectAllFilter | null>(null)
  const activateFilterSelectAll = (filter: FilterSelectAllFilter) => {
    setCheckedMailIds(new Set())
    setFilterSelectAll(filter)
  }
  const clearFilterSelectAll = () => setFilterSelectAll(null)

  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  // J/K 키보드 탐색 포커스 (열려있는 메일과는 별개)
  const [focusedMailId, setFocusedMailId] = useState<string | null>(null)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadGenerationRef = useRef(0)
  const inboxRequestRef = useRef<Promise<void> | null>(null)
  const trashRequestRef = useRef<Promise<void> | null>(null)

  // 이미 알고 있는 메일 ID 집합 — 새 메일 감지용 (초기 로드 시에는 트리거 안 함)
  const knownMailKeysRef = useRef<Set<string> | null>(null)
  // 뮤트 집합 — 폴링 클로저에서 최신 값 참조용. mail-org 훅이 소유한 mutedSet을 App.tsx가
  // updateMutedSet을 통해 여기 동기화해준다 (두 훅 사이의 순환 의존을 피하기 위한 다리 역할).
  const mutedSetRef = useRef<Set<string>>(new Set())
  const updateMutedSet = (set: Set<string>) => {
    mutedSetRef.current = set
  }

  // 삭제 요청이 아직 서버에 반영되지 않은 사이 폴링이 되살리는 것을 막기 위한 tombstone
  const deletedKeysRef = useRef<Set<string>>(new Set())

  const filterOutDeleted = (mails: Mail[]) =>
    mails.filter((m) => !deletedKeysRef.current.has(`${m.accountId}:${m.id}`))

  const loadAccountsAndMails = (notifyOnError = false) => {
    if (inboxRequestRef.current) return inboxRequestRef.current
    // 계정 목록과 메일 목록을 동시에 요청 (순차 요청 시 왕복 지연이 두 배로 누적됨)
    const generation = ++loadGenerationRef.current
    const request = (async () => {
      try {
      const [accounts, { mails, nextCursor: cursor, failedAccountIds: failed }] = await Promise.all([fetchAccounts(), fetchMails()])
      if (generation !== loadGenerationRef.current) return
      setRealAccounts(accounts)
      setFailedAccountIds(failed ?? [])
      const freshMails = filterOutDeleted(mails)

      // 새 메일 감지: 이전에 알고 있던 키에 없는 메일이 왔을 때 소리 + 푸시
      const freshKeys = new Set(freshMails.map((m) => `${m.accountId}:${m.id}`))
      if (knownMailKeysRef.current !== null) {
        const newKeys = [...freshKeys].filter((k) => !knownMailKeysRef.current!.has(k))
        const newNonMuted = newKeys.filter((k) => {
          const mail = freshMails.find((m) => `${m.accountId}:${m.id}` === k)
          return mail && !mutedSetRef.current.has(mail.fromEmail)
        })
        if (newNonMuted.length > 0) {
          playNotificationSound(getSoundPreference())
          notifyNewMail()
        }
      }
      knownMailKeysRef.current = freshKeys

      // fetchMails()는 항상 1페이지치만 돌려주므로, 여기서 prev를 통째로 freshMails로
      // 바꿔치기하면 "더 불러오기"로 쌓아온 2페이지 이후 메일들이 폴링 주기(20초)마다
      // 사라진다 — 사라진 메일은 체크박스 선택/일괄삭제 대상에서도 조용히 빠지고, 그 뒤
      // "더 불러오기"를 다시 누르면 (지워진 적이 없으니) 도로 나타나 마치 삭제가 "취소"된
      // 것처럼 보인다. 그래서 겹치는 부분만 최신 값으로 교체하고 나머지는 유지한다.
      setRealMails((prev) => {
        const freshIds = new Set(freshMails.map((m) => `${m.accountId}:${m.id}`))
        const kept = prev.filter((m) => {
          const key = `${m.accountId}:${m.id}`
          if (freshIds.has(key)) return false // 아래 freshMails 쪽 최신 값으로 대체됨
          if (deletedKeysRef.current.has(key)) return false // 삭제 확정된 메일은 되살리지 않음
          return true // 실패 계정이거나, 이전에 "더 불러오기"로 로드된 이후 페이지 메일
        })
        return [...freshMails, ...kept]
      })
      // nextCursor는 항상 "1페이지 다음"을 가리키므로, 이미 그보다 더 진행된 적이 있어도
      // 여기서 되돌리지 않는다 — 되돌리면 "더 불러오기"가 이미 본 페이지를 다시 밟는다.
      setNextCursor((prev) => prev ?? cursor)
      } catch (error) {
        // 실패 응답을 빈 목록으로 덮어쓰지 않고 다음 폴링 때 복구한다.
        console.error("[mail-workspace] 계정/메일 새로고침 실패:", error)
        if (notifyOnError) showError("계정과 메일을 새로고침하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      }
    })()
    inboxRequestRef.current = request.finally(() => {
      inboxRequestRef.current = null
    })
    return inboxRequestRef.current
  }

  // 탭이 보일 때만 20초마다 자동 새로고침
  usePolling(loadAccountsAndMails, 20_000, !!currentUser)

  const accounts = realAccounts
  const allMails = realMails

  // 검색어를 입력하면 이미 불러온 메일 안에서는 바로 필터링해 보여주고(즉각 반응),
  // 잠시 후(디바운스) 서버(Gmail 검색 / IMAP SEARCH)에서도 검색해 결과를 합친다.
  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setServerSearchResults(null)
      setIsServerSearching(false)
      return
    }
    const generation = ++searchGenerationRef.current
    setIsServerSearching(true)
    const timer = window.setTimeout(() => {
      searchMails(query).then(({ mails }) => {
        if (searchGenerationRef.current !== generation) return // 이미 검색어가 바뀐 뒤 늦게 도착한 응답은 버린다
        setServerSearchResults(mails)
        setIsServerSearching(false)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const handleSelectMail = (mailId: string | null) => {
    setSelectedMailId(mailId)
    if (!mailId) return
    const mail = allMails.find((m) => m.id === mailId) ?? folderMails.find((m) => m.id === mailId)
    if (mail && !mail.isRead) {
      setRealMails((prev) => prev.map((m) => (m.id === mailId ? { ...m, isRead: true } : m)))
      setFolderMails((prev) => prev.map((m) => (m.id === mailId ? { ...m, isRead: true } : m)))
      markAsRead(mailId, mail.accountId)
    }
  }

  const handleToggleStar = (mailId: string, accountId: string, starred: boolean) => {
    setRealMails((prev) =>
      prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isStarred: starred } : m)),
    )
    setFolderMails((prev) =>
      prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isStarred: starred } : m)),
    )
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail) return prev
      return { ...prev, [mailId]: { ...detail, isStarred: starred } }
    })
    toggleStar(mailId, accountId, starred)
  }

  const handleToggleCheck = (mailId: string) => {
    setFilterSelectAll(null) // 낱개 체크는 "전체 선택" 모드보다 우선한다
    setCheckedMailIds((prev) => {
      const next = new Set(prev)
      if (next.has(mailId)) next.delete(mailId)
      else next.add(mailId)
      return next
    })
  }

  // Shift-클릭 범위선택: 범위 안의 메일을 기존 선택에 더한다 (제거는 하지 않음)
  const handleCheckRange = (mailIds: string[]) => {
    setFilterSelectAll(null)
    setCheckedMailIds((prev) => {
      const next = new Set(prev)
      for (const id of mailIds) next.add(id)
      return next
    })
  }

  const selectByFilter = (mails: Mail[], filter: BulkSelectFilter) => {
    setFilterSelectAll(null)
    switch (filter) {
      case "all": setCheckedMailIds(new Set(mails.map((m) => m.id))); break
      case "none": setCheckedMailIds(new Set()); break
      case "read": setCheckedMailIds(new Set(mails.filter((m) => m.isRead).map((m) => m.id))); break
      case "unread": setCheckedMailIds(new Set(mails.filter((m) => !m.isRead).map((m) => m.id))); break
      case "starred": setCheckedMailIds(new Set(mails.filter((m) => m.isStarred).map((m) => m.id))); break
      case "unstarred": setCheckedMailIds(new Set(mails.filter((m) => !m.isStarred).map((m) => m.id))); break
    }
  }

  const handleSelectByFilterInFolder = (filter: BulkSelectFilter) => selectByFilter(folderMails, filter)

  const bulkMarkReadGeneric = async (
    mails: Mail[],
    setList: (updater: (prev: Mail[]) => Mail[]) => void,
    read: boolean,
  ) => {
    const targets = mails.filter((m) => checkedMailIds.has(m.id) && m.isRead !== read)
    setList((prev) => prev.map((m) => (checkedMailIds.has(m.id) ? { ...m, isRead: read } : m)))
    setCheckedMailIds(new Set())
    if (targets.length > 0) {
      setIsBulkLoading(true)
      const groups = groupIdsByAccount(targets)
      await Promise.all([...groups.entries()].map(([accountId, ids]) => bulkMarkRead(accountId, ids, read)))
      setIsBulkLoading(false)
    }
  }

  const bulkMarkRead_ = async (mails: Mail[], read: boolean) => {
    if (filterSelectAll) {
      setIsBulkLoading(true)
      const all = await fetchMailsByFilter(filterSelectAll)
      const targets = all.filter((m) => m.isRead !== read)
      const targetKeys = new Set(targets.map((m) => `${m.accountId}:${m.id}`))
      setRealMails((prev) => prev.map((m) => (targetKeys.has(`${m.accountId}:${m.id}`) ? { ...m, isRead: read } : m)))
      const groups = groupIdsByAccount(targets)
      await Promise.all([...groups.entries()].map(([accountId, ids]) => bulkMarkRead(accountId, ids, read)))
      setFilterSelectAll(null)
      setIsBulkLoading(false)
      return
    }
    return bulkMarkReadGeneric(mails, setRealMails, read)
  }
  const handleBulkMarkReadInFolder = () => bulkMarkReadGeneric(folderMails, setFolderMails, true)
  const handleBulkMarkUnreadInFolder = () => bulkMarkReadGeneric(folderMails, setFolderMails, false)

  const bulkToggleStarGeneric = async (
    mails: Mail[],
    setList: (updater: (prev: Mail[]) => Mail[]) => void,
    starred: boolean,
  ) => {
    const targets = mails.filter((m) => checkedMailIds.has(m.id) && m.isStarred !== starred)
    setList((prev) => prev.map((m) => (checkedMailIds.has(m.id) ? { ...m, isStarred: starred } : m)))
    setCheckedMailIds(new Set())
    if (targets.length > 0) {
      setIsBulkLoading(true)
      const groups = groupIdsByAccount(targets)
      await Promise.all([...groups.entries()].map(([accountId, ids]) => bulkToggleStar(accountId, ids, starred)))
      setIsBulkLoading(false)
    }
  }

  const bulkToggleStar_ = async (mails: Mail[], starred: boolean) => {
    if (filterSelectAll) {
      setIsBulkLoading(true)
      const all = await fetchMailsByFilter(filterSelectAll)
      const targets = all.filter((m) => m.isStarred !== starred)
      const targetKeys = new Set(targets.map((m) => `${m.accountId}:${m.id}`))
      setRealMails((prev) => prev.map((m) => (targetKeys.has(`${m.accountId}:${m.id}`) ? { ...m, isStarred: starred } : m)))
      const groups = groupIdsByAccount(targets)
      await Promise.all([...groups.entries()].map(([accountId, ids]) => bulkToggleStar(accountId, ids, starred)))
      setFilterSelectAll(null)
      setIsBulkLoading(false)
      return
    }
    return bulkToggleStarGeneric(mails, setRealMails, starred)
  }
  const handleBulkStarInFolder = () => bulkToggleStarGeneric(folderMails, setFolderMails, true)
  const handleBulkUnstarInFolder = () => bulkToggleStarGeneric(folderMails, setFolderMails, false)

  // 낙관적으로 즉시 제거하되, 실패한 계정 몫은 되돌리고 에러를 표시한다.
  // 삭제 확정 전까지는 tombstone에 등록해 폴링이 되살리지 못하게 막는다.
  const deleteMailsWithRevert = async (targets: Mail[], origin: "inbox" | "folder" = "inbox") => {
    if (targets.length === 0) return
    for (const m of targets) deletedKeysRef.current.add(`${m.accountId}:${m.id}`)

    const setList = origin === "folder" ? setFolderMails : setRealMails
    const deletedIds = new Set(targets.map((m) => m.id))
    setList((prev) => prev.filter((m) => !deletedIds.has(m.id)))
    setMailDetails((prev) => {
      const next = { ...prev }
      for (const id of deletedIds) delete next[id]
      return next
    })
    setSelectedMailId((prev) => (prev && deletedIds.has(prev) ? null : prev))

    // 계정 하나당 UID를 한꺼번에 너무 많이 보내면 일부 IMAP 서버가 명령 길이 제한에 걸리거나,
    // 유효하지 않은 UID를 조용히 건너뛰고도 전체 응답을 OK로 돌려줘서 일부만 삭제되고도 성공한
    // 것처럼 보일 수 있다 — "전체 선택" 기능처럼 대상이 아주 많을 수 있으니 나눠서 보낸다.
    const DELETE_CHUNK = 200
    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => {
        for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
          const chunk = ids.slice(i, i + DELETE_CHUNK)
          const result = await bulkDeleteMails(accountId, chunk)
          // 실패하면 이후 청크는 시도조차 안 했으므로, 그 실패한 청크 + 아직 안 보낸 나머지를
          // 전부 "되돌릴 대상"으로 묶어서 반환한다 (안 그러면 시도 안 한 것들이 낙관적으로
          // 지워진 화면 상태 그대로 남아 실제로는 안 지워졌는데 지워진 것처럼 보인다).
          if (!result.ok) return { accountId, ids: ids.slice(i), result }
        }
        return { accountId, ids: [] as string[], result: { ok: true } as { ok: boolean; error?: string } }
      }),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      for (const m of failedTargets) deletedKeysRef.current.delete(`${m.accountId}:${m.id}`)
      setList((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 삭제하지 못했습니다. 다시 시도해주세요.")
    }
  }

  const bulkDelete = async (mails: Mail[]) => {
    if (filterSelectAll) {
      setIsBulkLoading(true)
      const all = await fetchMailsByFilter(filterSelectAll)
      const targets = all.filter((m) => !m.isStarred)
      if (all.length > targets.length) showError("별표 표시된 메일은 삭제되지 않았습니다.")
      await deleteMailsWithRevert(targets)
      setFilterSelectAll(null)
      setIsBulkLoading(false)
      return
    }
    const checked = mails.filter((m) => checkedMailIds.has(m.id))
    const targets = checked.filter((m) => !m.isStarred)
    if (checked.length > targets.length) showError("별표 표시된 메일은 삭제되지 않았습니다.")
    if (targets.length === 0) { setCheckedMailIds(new Set()); return }
    setCheckedMailIds(new Set())
    setIsBulkLoading(true)
    await deleteMailsWithRevert(targets)
    setIsBulkLoading(false)
  }

  const handleBulkDeleteInFolder = async () => {
    const checked = folderMails.filter((m) => checkedMailIds.has(m.id))
    const targets = checked.filter((m) => !m.isStarred)
    if (checked.length > targets.length) showError("별표 표시된 메일은 삭제되지 않았습니다.")
    if (targets.length === 0) { setCheckedMailIds(new Set()); return }
    setCheckedMailIds(new Set())
    setIsBulkLoading(true)
    await deleteMailsWithRevert(targets, "folder")
    setIsBulkLoading(false)
  }

  const handleMarkAsUnread = (mailId: string, accountId: string) => {
    setRealMails((prev) => prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isRead: false } : m)))
    setFolderMails((prev) => prev.map((m) => (m.id === mailId && m.accountId === accountId ? { ...m, isRead: false } : m)))
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail) return prev
      return { ...prev, [mailId]: { ...detail, isRead: false } }
    })
    markAsUnread(mailId, accountId)
  }

  const handleDeleteMail = async (mailId: string, accountId: string) => {
    const target = allMails.find((m) => m.id === mailId && m.accountId === accountId)
      ?? folderMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (!target) return
    await deleteMailsWithRevert([target], view === "folder" ? "folder" : "inbox")
  }

  // 보관/받은편지함 이동: 실제 서버에서는 옮기지 않고 앱 내부 배정만 바꾼다.
  // 분류 메일함 배정은 라벨처럼 동작해서(여러 개에 동시에 속할 수 있음) 추가하는 것만으로는 지금 보는
  // 목록에서 사라지지 않는다 — 받은편지함에서는 보관할 때만, 분류 메일함 화면에서는 그 배정을 뺄 때만 사라진다.
  const applyMove = async (
    targets: Mail[],
    folderId: string | null,
    origin: "inbox" | "folder",
    fromFolderId?: string | null,
  ) => {
    if (targets.length === 0) return
    const removeFromView = origin === "inbox" ? folderId === ARCHIVE_FOLDER_ID : folderId === null
    const setList = origin === "folder" ? setFolderMails : setRealMails
    const ids = new Set(targets.map((m) => m.id))

    if (removeFromView) {
      setList((prev) => prev.filter((m) => !ids.has(m.id)))
      setMailDetails((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
      setSelectedMailId((prev) => (prev && ids.has(prev) ? null : prev))
    }

    const items = targets.map((m) => ({ accountId: m.accountId, mailId: m.id }))
    const result = await moveMails(items, folderId, fromFolderId)
    if (!result.ok) {
      if (removeFromView) setList((prev) => [...prev, ...targets])
      showError(result.error ?? "메일 이동에 실패했습니다.")
    }
  }

  const bulkMoveFromInbox = async (mails: Mail[], folderId: string | null) => {
    if (filterSelectAll) {
      setIsBulkLoading(true)
      const all = await fetchMailsByFilter(filterSelectAll)
      await applyMove(all, folderId, "inbox")
      setFilterSelectAll(null)
      setIsBulkLoading(false)
      return
    }
    const targets = mails.filter((m) => checkedMailIds.has(m.id))
    setCheckedMailIds(new Set())
    applyMove(targets, folderId, "inbox")
  }

  const handleBulkMoveFromFolder = (folderId: string | null) => {
    const targets = folderMails.filter((m) => checkedMailIds.has(m.id))
    setCheckedMailIds(new Set())
    applyMove(targets, folderId, "folder", selectedFolderId)
  }

  const handleMoveMailFromInbox = (mailId: string, accountId: string, folderId: string | null) => {
    const target = allMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "inbox")
  }

  const handleMoveMailFromFolder = (mailId: string, accountId: string, folderId: string | null) => {
    const target = folderMails.find((m) => m.id === mailId && m.accountId === accountId)
    if (target) applyMove([target], folderId, "folder", selectedFolderId)
  }

  // 분류 메일함 배정을 개별로 추가/제거한다 (메일 하나가 여러 분류 메일함에 동시에 속할 수 있다).
  const handleToggleMailFolder = async (mailId: string, accountId: string, folderId: string, assign: boolean) => {
    const patchFolderIds = (mail: Mail): Mail => {
      const current = mail.folderIds ?? []
      const next = assign ? [...new Set([...current, folderId])] : current.filter((id) => id !== folderId)
      return { ...mail, folderIds: next }
    }
    const isTarget = (m: Mail) => m.id === mailId && m.accountId === accountId

    setRealMails((prev) => prev.map((m) => (isTarget(m) ? patchFolderIds(m) : m)))
    setFolderMails((prev) => {
      // 지금 보고 있는 분류 메일함에서 배정을 빼면 그 목록에서도 사라져야 한다.
      if (!assign && folderId === selectedFolderId) return prev.filter((m) => !isTarget(m))
      return prev.map((m) => (isTarget(m) ? patchFolderIds(m) : m))
    })
    setMailDetails((prev) => {
      const detail = prev[mailId]
      if (!detail || detail.accountId !== accountId) return prev
      return { ...prev, [mailId]: patchFolderIds(detail) }
    })
    if (!assign && folderId === selectedFolderId) {
      setSelectedMailId((prev) => (prev === mailId ? null : prev))
    }

    const result = await toggleMailFolder(accountId, mailId, folderId, assign)
    if (!result.ok) {
      showError(result.error ?? "분류 메일함 배정 변경에 실패했습니다.")
      loadAccountsAndMails()
      if (selectedFolderId) loadFolderMails(selectedFolderId)
    }
  }

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { mails, nextCursor: newCursor } = await fetchMails(nextCursor)
      setRealMails((prev) => {
        const existingIds = new Set(prev.map((m) => `${m.accountId}:${m.id}`))
        const fresh = filterOutDeleted(mails).filter((m) => !existingIds.has(`${m.accountId}:${m.id}`))
        return [...prev, ...fresh]
      })
      setNextCursor(newCursor)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleMarkAllRead = async (accountId?: string) => {
    // 로컬 상태 즉시 반영
    setRealMails((prev) => prev.map((m) => {
      if (!m.isRead && (accountId === undefined || m.accountId === accountId)) return { ...m, isRead: true }
      return m
    }))
    // 서버에서 전체 미읽은 메일 처리 (페이지에 로드되지 않은 메일 포함)
    const targetAccounts = accountId
      ? [accountId]
      : [...new Set(realMails.filter((m) => !m.isRead).map((m) => m.accountId))]
    await Promise.all(targetAccounts.map((id) => markAllMailsRead(id)))
  }

  const handleDeleteBeforeDate = async (cutoff: Date, accountId?: string) => {
    const targets = realMails.filter((m) => {
      const match = accountId === undefined || m.accountId === accountId
      return match && new Date(m.receivedAt) < cutoff
    })
    await deleteMailsWithRevert(targets)
  }

  const loadTrash = () => {
    if (trashRequestRef.current) return trashRequestRef.current
    setIsTrashLoading(true)
    const request = fetchTrashMails()
      .then(({ mails, nextCursor: cursor }) => {
        setTrashMails(mails)
        setTrashCursor(cursor)
      })
    trashRequestRef.current = request.finally(() => {
      trashRequestRef.current = null
      setIsTrashLoading(false)
    })
    return trashRequestRef.current
  }

  const handleLoadMoreTrash = async () => {
    if (!trashCursor || isTrashLoadingMore) return
    setIsTrashLoadingMore(true)
    try {
      const { mails, nextCursor: newCursor } = await fetchTrashMails(trashCursor)
      setTrashMails((prev) => {
        const existingIds = new Set(prev.map((m) => `${m.accountId}:${m.id}`))
        const fresh = mails.filter((m) => !existingIds.has(`${m.accountId}:${m.id}`))
        return [...prev, ...fresh]
      })
      setTrashCursor(newCursor)
    } finally {
      setIsTrashLoadingMore(false)
    }
  }

  const handleEmptyTrashAccount = async (accountId: string) => {
    const result = await emptyTrash(accountId)
    if (!result.ok) {
      showError(result.error ?? "휴지통을 비우지 못했습니다.")
      return
    }
    setTrashMails((prev) => prev.filter((m) => m.accountId !== accountId))
  }

  const handleEmptyAllTrash = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await emptyAllTrash()
    if (result.ok) setTrashMails([])
    return result
  }

  const handleDeleteFromTrash = async (targets: Mail[]) => {
    if (targets.length === 0) return
    const deletedIds = new Set(targets.map((m) => m.id))
    setTrashMails((prev) => prev.filter((m) => !deletedIds.has(m.id)))

    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => ({
        accountId,
        ids,
        result: await permanentDeleteFromTrash(accountId, ids),
      })),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      setTrashMails((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 영구 삭제하지 못했습니다.")
    }
  }

  const handleRestoreFromTrash = async (targets: Mail[]) => {
    if (targets.length === 0) return
    const restoredIds = new Set(targets.map((m) => m.id))
    setTrashMails((prev) => prev.filter((m) => !restoredIds.has(m.id)))

    const groups = groupIdsByAccount(targets)
    const outcomes = await Promise.all(
      [...groups.entries()].map(async ([accountId, ids]) => ({
        accountId,
        ids,
        result: await restoreFromTrash(accountId, ids),
      })),
    )

    const failed = outcomes.filter((o) => !o.result.ok)
    if (failed.length > 0) {
      const failedTargets = targets.filter((m) =>
        failed.some((f) => f.accountId === m.accountId && f.ids.includes(m.id)),
      )
      setTrashMails((prev) => [...prev, ...failedTargets])
      showError(failed[0].result.error ?? "일부 메일을 복구하지 못했습니다.")
    }

    // 복구된 메일이 받은편지함에 다시 보이도록 새로고침
    if (failed.length < outcomes.length) loadAccountsAndMails()
  }

  const loadFolderMails = (folderId: string) => {
    // 이미 캐시된 폴더면 로딩 스피너 없이 캐시를 그대로 보여주고, 최신 상태로 조용히 갱신만 한다.
    const isCached = folderId in folderMailsCache
    if (!isCached) setIsFolderLoading(true)
    return fetchFolderMails(folderId)
      .then((mails) => setFolderMailsCache((prev) => ({ ...prev, [folderId]: mails })))
      .finally(() => setIsFolderLoading(false))
  }

  const handleManualRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      if (view === "trash") await loadTrash()
      else if ((view === "folder" || view === "archive") && selectedFolderId) await loadFolderMails(selectedFolderId)
      else await loadAccountsAndMails(true)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleUpdateSignature = async (accountId: string, signature: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await updateAccountSignature(accountId, signature)
    if (!result.ok) return { ok: false, error: result.error }
    setRealAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, signature: signature.trim() || undefined } : a)),
    )
    return { ok: true }
  }

  // 계정과 관련된 메일 데이터를 정리한다. selectedAccountId/selectedMailId 같은 화면 상태는
  // App.tsx가 소유하므로, "삭제한 계정이 지금 보고 있는 계정이면" 판단과 그 상태 초기화는
  // App.tsx의 얇은 래퍼(handleDeleteAccount)에서 처리한다.
  const handleDeleteAccount = (accountId: string) => {
    setRealAccounts((prev) => prev.filter((a) => a.id !== accountId))
    setRealMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setTrashMails((prev) => prev.filter((m) => m.accountId !== accountId))
    setFolderMailsCache((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, mails]) => [id, mails.filter((m) => m.accountId !== accountId)])),
    )
    setMailDetails((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (next[key].accountId === accountId) delete next[key]
      }
      return next
    })
  }

  const handleReorderAccounts = async (order: string[]) => {
    const previous = realAccounts
    const byId = new Map(realAccounts.map((a) => [a.id, a]))
    setRealAccounts(order.map((id) => byId.get(id)).filter((a): a is Account => !!a))
    const result = await apiReorderAccounts(order)
    if (!result.ok) {
      setRealAccounts(previous)
      showError(result.error ?? "계정 순서 변경에 실패했습니다.")
    }
  }

  const setMailDetail = (detail: Mail) => {
    setMailDetails((prev) => ({ ...prev, [detail.id]: detail }))
  }

  // App.tsx의 handleLogout이 호출한다. "워크스페이스 관심사"만 초기화한다 — 원래 handleLogout이
  // 손대지 않던 상태(failedAccountIds, isLoadingMore, checkedMailIds, searchQuery 등 — 이들은
  // 원래 goHome()을 통해 별도로 초기화됨)는 여기서도 그대로 건드리지 않는다.
  const reset = () => {
    setRealAccounts([])
    setRealMails([])
    setMailDetails({})
    setNextCursor(null)
    setTrashMails([])
    setTrashCursor(null)
    setFolderMailsCache({})
  }

  return {
    // 상태
    accounts,
    failedAccountIds,
    allMails,
    mailDetails,
    nextCursor,
    isLoadingMore,
    trashMails,
    trashCursor,
    isTrashLoading,
    isTrashLoadingMore,
    folderMails,
    isFolderLoading,
    serverSearchResults,
    isServerSearching,
    searchQuery,
    checkedMailIds,
    filterSelectAll,
    activateFilterSelectAll,
    clearFilterSelectAll,
    isBulkLoading,
    selectedMailId,
    focusedMailId,
    isRefreshing,

    // 세터
    setSearchQuery,
    setCheckedMailIds,
    setSelectedMailId,
    setFocusedMailId,
    setMailDetail,
    updateMutedSet,

    // 핸들러/함수
    loadAccountsAndMails,
    loadFolderMails,
    loadTrash,
    handleSelectMail,
    handleToggleStar,
    handleToggleCheck,
    handleCheckRange,
    selectByFilter,
    handleSelectByFilterInFolder,
    bulkMarkRead: bulkMarkRead_,
    handleBulkMarkReadInFolder,
    handleBulkMarkUnreadInFolder,
    bulkToggleStar: bulkToggleStar_,
    handleBulkStarInFolder,
    handleBulkUnstarInFolder,
    bulkDelete,
    handleBulkDeleteInFolder,
    handleMarkAsUnread,
    handleDeleteMail,
    bulkMoveFromInbox,
    handleBulkMoveFromFolder,
    handleMoveMailFromInbox,
    handleMoveMailFromFolder,
    handleToggleMailFolder,
    handleLoadMore,
    handleMarkAllRead,
    handleDeleteBeforeDate,
    handleLoadMoreTrash,
    handleEmptyTrashAccount,
    handleEmptyAllTrash,
    handleDeleteFromTrash,
    handleRestoreFromTrash,
    handleManualRefresh,
    handleUpdateSignature,
    handleDeleteAccount,
    handleReorderAccounts,
    reset,
  }
}

export type MailWorkspace = ReturnType<typeof useMailWorkspace>
