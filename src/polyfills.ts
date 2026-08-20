import { Buffer } from 'buffer'

import * as process from 'process'

if (typeof window !== 'undefined') {
  window.global = window
  window.Buffer = Buffer
  window.process = process
}