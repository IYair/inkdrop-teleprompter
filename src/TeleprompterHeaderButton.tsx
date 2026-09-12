import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSelector } from 'react-redux'
import type { CommandButtonProps } from '@inkdropapp/types'
import { getEnv } from './env'

export const TeleprompterHeaderButton: React.FC = () => {
  const noteId = useSelector((state: any) => state.editingNote?._id)
  const AppHeaderButton = getEnv().components.getComponentClass('AppHeaderButton') as React.FC<CommandButtonProps>
  const [viewModeGroup, setViewModeGroup] = useState<Element | null>(null)

  useEffect(() => {
    const syncTarget = () => {
      const nextTarget = document.querySelector('.editor-header-view-mode')
      setViewModeGroup(current => current === nextTarget ? current : nextTarget)
    }
    syncTarget()
    const observer = new MutationObserver(syncTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const button = (
    <AppHeaderButton
      className="teleprompter-header-button"
      title="Abrir teleprompter"
      aria-label="Abrir teleprompter"
      disabled={!noteId}
      command="inkdrop-teleprompter:toggle"
    >
      <span className="teleprompter-header-icon" aria-hidden="true" />
    </AppHeaderButton>
  )

  return viewModeGroup ? createPortal(button, viewModeGroup) : null
}
