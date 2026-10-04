import { ChartColumn, CircleHelp, FileText, GraduationCap, MessageSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ScreenId = 'landing' | 'ask' | 'quiz' | 'progress' | 'notes' | 'papers'

export interface NavItem {
  id: Exclude<ScreenId, 'landing'>
  label: string
  tabLabel: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'ask', label: 'Ask', tabLabel: 'Ask', icon: MessageSquare },
  { id: 'quiz', label: 'Quiz', tabLabel: 'Quiz', icon: CircleHelp },
  { id: 'papers', label: 'Past Papers', tabLabel: 'Papers', icon: GraduationCap },
  { id: 'progress', label: 'Progress', tabLabel: 'Progress', icon: ChartColumn },
  { id: 'notes', label: 'Notes', tabLabel: 'Notes', icon: FileText },
]
