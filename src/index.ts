import type { Environment, IInkdropPlugin } from '@inkdropapp/types'
import { setEnv } from './env'
import { TeleprompterDialog } from './TeleprompterDialog'
import { TeleprompterHeaderButton } from './TeleprompterHeaderButton'

class InkdropPlugin implements IInkdropPlugin {
  config: IInkdropPlugin['config'] = {
    profile: {
      title: 'Reading profile',
      type: 'string',
      default: 'youtube',
      enum: ['youtube', 'reel', 'presentation', 'custom']
    },
    speedWpm: {
      title: 'Reading speed (words per minute)',
      type: 'number',
      default: 135,
      minimum: 60,
      maximum: 240
    },
    fontSize: {
      title: 'Font size',
      type: 'number',
      default: 60,
      minimum: 32,
      maximum: 104
    },
    fontFamily: {
      title: 'Teleprompter font family',
      type: 'string',
      default: 'app'
    },
    countdown: {
      title: 'Countdown (seconds)',
      type: 'number',
      default: 3,
      minimum: 0,
      maximum: 10
    },
    mirror: {
      title: 'Mirror text',
      type: 'boolean',
      default: false
    }
  }

  activate(env: Environment) {
    setEnv(env)
    env.components.registerClass(TeleprompterDialog, 'TeleprompterDialog')
    env.layouts.addComponentToLayout('modal', 'TeleprompterDialog')
    env.components.registerClass(TeleprompterHeaderButton, 'TeleprompterHeaderButton')
    env.layouts.insertComponentToLayoutAfter('editor-header', 'EditorHeaderViewMode', 'TeleprompterHeaderButton')
  }

  deactivate(env: Environment) {
    env.layouts.removeComponentFromLayout('editor-header', 'TeleprompterHeaderButton')
    env.components.deleteClass(TeleprompterHeaderButton)
    env.layouts.removeComponentFromLayout('modal', 'TeleprompterDialog')
    env.components.deleteClass(TeleprompterDialog)
    setEnv(undefined)
  }
}

export default new InkdropPlugin()
