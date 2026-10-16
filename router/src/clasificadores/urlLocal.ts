// router/src/clasificadores/urlLocal.ts
/**
 * Piezas puras del POST al servidor local: fetch rechaza URLs con usuario y contraseña, así que se
 * piden por Basic y la URL se usa sin ellas; y ningún error lleva la key, la URL ni las credenciales.
 * Sin imports: solo URL, btoa y decodeURIComponent (el mod no tiene APIs de Node).
 */

export type UrlLocal = { urlPedido: string; basic: string | null; secretos: string[] }

const decodificar = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const base64Utf8 = (texto: string) => btoa(Array.from(new TextEncoder().encode(texto), b => String.fromCharCode(b)).join(''))

/** La URL a pedir (sin userinfo), el valor Basic si había credenciales, y los textos que no deben salir en errores. */
export function separarUrlLocal(url: string): UrlLocal {
  try {
    const u = new URL(url)
    if (!u.username && !u.password) return { urlPedido: url, basic: null, secretos: [url] }
    const usuario = decodificar(u.username)
    const clave = decodificar(u.password)
    const crudo = `${u.username}:${u.password}`
    u.username = ''
    u.password = ''
    const urlPedido = u.toString()
    return {
      urlPedido,
      basic: base64Utf8(`${usuario}:${clave}`),
      secretos: [url, urlPedido, crudo, `${usuario}:${clave}`, clave].filter(Boolean),
    }
  } catch {
    return { urlPedido: url, basic: null, secretos: [url] }
  }
}

/** Tapa con *** cada secreto (los más largos primero, para que uno no deje restos de otro). */
export function taparSecretos(texto: string, secretos: readonly (string | null | undefined)[]): string {
  let s = texto
  for (const x of [...secretos].filter((x): x is string => !!x).sort((a, b) => b.length - a.length)) s = s.split(x).join('***')
  return s
}
