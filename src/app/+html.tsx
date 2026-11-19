import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return <html {...htmlAttributes} lang="pt-BR"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#153F34" /><meta name="apple-mobile-web-app-capable" content="yes" /><link rel="manifest" href="/manifest.json" /><title>Agente Financeiro</title><ScrollViewStyleReset />{headNodes}</head><body {...bodyAttributes}>{children}{bodyNodes}</body></html>;
}
