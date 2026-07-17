import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ホーム画面アプリ（PWA）用の Service Worker を登録する（本番のみ）。
// 開発中は登録しない（キャッシュで古い画面が出るのを防ぐため）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 失敗しても通常のWebとして動作する */ })
  })
}
