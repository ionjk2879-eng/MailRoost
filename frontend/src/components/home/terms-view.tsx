import { BrandMark } from "@/components/brand-mark"
import { useNavigate } from "react-router-dom"

export function TermsView() {
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
        <h1 className="mb-1 text-2xl font-bold">이용약관</h1>
        <p className="mb-10 text-sm text-zinc-500">시행일: 2026년 10월 16일</p>

        <section className="space-y-10 text-sm leading-7 text-zinc-700 dark:text-zinc-300">

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">1. 목적</h2>
            <p>본 약관은 MailRoost(이하 "서비스")가 제공하는 메일 통합 관리 서비스의 이용 조건 및 절차, 이용자와 서비스 간의 권리·의무를 규정함을 목적으로 합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">2. 서비스 내용</h2>
            <p>서비스는 Gmail, 네이버 메일, 다음 메일 등 여러 이메일 계정을 하나의 인터페이스에서 통합 조회·관리할 수 있는 개인용 웹 메일 클라이언트입니다. 서비스는 이용자의 메일 서버에 직접 접속하여 메일을 조회할 뿐, 메일을 별도로 복사·저장하거나 제3자에게 전송하지 않습니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">3. 이용자의 의무</h2>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>타인의 계정 정보를 무단으로 사용하지 않을 것</li>
              <li>서비스를 이용하여 스팸·악성 메일을 발송하지 않을 것</li>
              <li>서비스의 정상적인 운영을 방해하는 행위를 하지 않을 것</li>
              <li>관계 법령 및 본 약관을 준수할 것</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">4. 서비스의 중단</h2>
            <p>서비스는 시스템 점검, 장애, 천재지변 등 불가피한 사유가 발생한 경우 서비스 제공을 일시 중단할 수 있습니다. 서비스 중단 시 가능한 범위 내에서 사전 또는 사후 공지합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">5. 면책사항</h2>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>서비스는 각 메일 서비스(Google, 네이버, 다음 등)의 API 정책 변경·장애로 인해 발생하는 서비스 지연·중단에 대해 책임지지 않습니다.</li>
              <li>서비스는 이용자가 서비스를 통해 송수신한 메일의 내용에 대해 책임지지 않습니다.</li>
              <li>이용자가 본 약관을 위반하여 발생하는 손해에 대해 서비스는 책임지지 않습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">6. 계정 해지</h2>
            <p>이용자는 언제든지 서비스 내 설정에서 계정을 삭제할 수 있습니다. 계정 삭제 시 저장된 모든 데이터(OAuth 토큰, 분류 규칙, 설정 등)가 즉시 파기됩니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">7. 약관의 변경</h2>
            <p>서비스는 필요에 따라 약관을 변경할 수 있으며, 변경된 약관은 서비스 내 공지를 통해 안내합니다. 변경 이후 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 간주합니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">8. 준거법 및 관할</h2>
            <p>본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련하여 분쟁이 발생할 경우 관할 법원은 민사소송법에 따릅니다.</p>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-zinc-900 dark:text-foreground">9. 문의</h2>
            <p>약관에 관한 문의는 아래로 연락하세요.</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
              <li>이메일: <a href="mailto:ionjk2879@gmail.com" className="text-orange-600 underline dark:text-orange-400">ionjk2879@gmail.com</a></li>
            </ul>
          </div>

        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-zinc-400">
        © 2026 MailRoost
      </footer>
    </div>
  )
}
