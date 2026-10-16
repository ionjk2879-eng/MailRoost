import { BrandMark } from "@/components/brand-mark"
import { useNavigate } from "react-router-dom"

export function PrivacyView() {
  const navigate = useNavigate()
  return (
    <div className="min-h-svh bg-[#fffaf5] text-zinc-900 dark:bg-background dark:text-foreground">
      <header className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-5 sm:px-8">
        <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2 text-sm font-medium hover:opacity-70">
          <BrandMark className="size-7 rounded-lg shadow-sm shadow-orange-500/25" />
          <span className="font-bold">Mail<span className="text-orange-500">Roost</span></span>
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-6 sm:px-8">
        <h1 className="mb-1 text-2xl font-bold">개인정보처리방침</h1>
        <p className="mb-10 text-sm text-zinc-500">시행일: 2026년 10월 16일</p>

        <section className="space-y-10 text-sm leading-7 text-zinc-700 dark:text-zinc-300">

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">1. 총칙</h2>
            <p>MailRoost(이하 "서비스")는 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 및 관계 법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 수집하고, 어떻게 이용·보호하는지 안내합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">2. 수집하는 개인정보 항목 및 수집 방법</h2>
            <p>서비스는 다음 정보를 수집합니다.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li><strong>Google OAuth 연동 시</strong>: 이메일 주소, Google 계정 식별자, OAuth 액세스·리프레시 토큰, Gmail 메일 데이터(제목·발신자·본문·첨부파일)</li>
              <li><strong>네이버·다음 IMAP 연동 시</strong>: IMAP 서버 접속에 필요한 이메일 주소 및 앱 비밀번호(암호화 저장)</li>
              <li><strong>자동 생성 정보</strong>: 메일 분류 규칙, 스누즈·뮤트 설정, 자동응답 규칙 등 서비스 이용 중 생성하는 설정 데이터</li>
            </ul>
            <p className="mt-2">수집 방법: 이용자의 직접 입력 및 OAuth 인증 절차를 통한 수집.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">3. 개인정보의 수집 및 이용 목적</h2>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>여러 메일 계정의 통합 조회·관리 서비스 제공</li>
              <li>메일 분류·필터·자동응답 등 기능 제공</li>
              <li>서비스 오류 파악 및 개선</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">4. 개인정보의 보유 및 이용 기간</h2>
            <p>이용자가 서비스 탈퇴(계정 삭제)를 요청할 때까지 보유합니다. 탈퇴 즉시 OAuth 토큰 및 저장된 설정 데이터를 파기합니다. 단, 관계 법령에 따라 일정 기간 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">5. 개인정보의 제3자 제공</h2>
            <p>서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외입니다.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>이용자가 직접 동의한 경우</li>
              <li>법령의 규정에 의거하거나 수사 기관의 요구가 있는 경우</li>
            </ul>
            <p className="mt-2">메일 데이터는 Google, 네이버, 다음 등 각 메일 서비스 제공자의 API를 통해 이용자 본인의 계정에 접근하며, 해당 데이터는 제3자에게 판매·공유되지 않습니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">6. 개인정보의 처리 위탁</h2>
            <p>서비스는 안정적인 운영을 위해 아래 업체에 처리를 위탁합니다.</p>
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-100 dark:bg-zinc-800">
                  <th className="border border-zinc-200 px-3 py-2 text-left dark:border-zinc-700">수탁자</th>
                  <th className="border border-zinc-200 px-3 py-2 text-left dark:border-zinc-700">위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-zinc-200 px-3 py-2 dark:border-zinc-700">Cloudflare, Inc.</td>
                  <td className="border border-zinc-200 px-3 py-2 dark:border-zinc-700">서버 운영 및 데이터 저장 (KV, Workers)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">7. 이용자의 권리</h2>
            <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>개인정보 열람 요청</li>
              <li>개인정보 정정·삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>서비스 탈퇴 및 계정 삭제 요청</li>
            </ul>
            <p className="mt-2">권리 행사는 서비스 내 설정 메뉴 또는 아래 연락처를 통해 신청하실 수 있으며, 지체 없이 처리합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">8. 쿠키 및 세션</h2>
            <p>서비스는 로그인 상태 유지를 위해 쿠키 또는 브라우저 세션 스토리지를 사용합니다. 이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 이 경우 서비스 이용이 제한될 수 있습니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">9. 개인정보의 안전성 확보 조치</h2>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>OAuth 토큰 및 IMAP 자격증명은 암호화하여 저장</li>
              <li>HTTPS를 통한 암호화된 데이터 전송</li>
              <li>Cloudflare Workers의 격리된 실행 환경에서 처리</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">10. 개인정보보호 담당자</h2>
            <p>개인정보 처리에 관한 문의·불만·피해구제 등은 아래로 연락하세요.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>이메일: <a href="mailto:ionjk2879@gmail.com" className="text-orange-600 underline dark:text-orange-400">ionjk2879@gmail.com</a></li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">11. 방침 변경</h2>
            <p>본 방침은 법령·서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지사항을 통해 사전 안내합니다.</p>
          </div>

        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-zinc-400">
        © 2026 MailRoost
      </footer>
    </div>
  )
}
