/**
 * Promise.withResolvers — needed by pdfjs-dist on Node < 22 (CI still on 20).
 * Safe no-op when the native method exists.
 */
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
