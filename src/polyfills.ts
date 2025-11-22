import { Buffer } from 'buffer'

// @ts-ignore
import * as process from 'process'

if (typeof window !== 'undefined') {
  window.global = window
  window.Buffer = Buffer
  // @ts-ignore
  window.process = process
}