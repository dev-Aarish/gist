import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty__mark" aria-hidden="true">
        <Icon size={20} strokeWidth={1.5} />
      </span>
      <h2 className="t-h2">{title}</h2>
      {children ? <p className="t-body empty__copy">{children}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  )
}
