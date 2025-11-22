export function inspect(obj: any) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch (e) {
    return String(obj)
  }
}

export const promisify = (fn: any) => (...args: any[]) =>
  new Promise((resolve, reject) => {
    fn(...args, (err: any, res: any) => {
      if (err) reject(err)
      else resolve(res)
    })
  })

export const inherits = (ctor: any, superCtor: any) => {
  ctor.super_ = superCtor
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  })
}

export default {
  inspect,
  promisify,
  inherits
}