'use client';
import { useState } from 'react';
type Tab = 'Чаты' | 'Контакты' | 'Настройки';
export default function Home() {
  const [tab, setTab] = useState<Tab>('Чаты');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  return <div className={theme}><main className="screen">
    <header><div className="brand"><span className="logo">●</span><h1>Connect</h1></div><span className="version">0.1</span></header>
    {tab === 'Чаты' && <><input className="search" aria-label="Поиск чатов" placeholder="Поиск"/><div className="empty"><div className="symbol">◉</div><h2>Пока нет переписок</h2><p>Здесь появятся личные чаты после подключения авторизации и базы данных.</p></div></>}
    {tab === 'Контакты' && <><h2>Контакты</h2><input className="search" aria-label="Поиск контактов" placeholder="Поиск"/><div className="empty"><div className="symbol">♙</div><h2>Контактов пока нет</h2><p>Все приглашённые пользователи будут отображаться здесь.</p></div></>}
    {tab === 'Настройки' && <><h2>Настройки</h2><div className="panel"><strong>Профиль</strong><p>Станет доступен после входа в аккаунт.</p></div><div className="panel"><strong>Оформление</strong><p>Выберите тему интерфейса.</p><div className="choices"><button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>Тёмная</button><button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}>Светлая</button></div></div><div className="panel"><strong>Уведомления</strong><p>Настроим после подключения сообщений.</p></div></>}
  </main><nav aria-label="Основная навигация">{(['Чаты','Контакты','Настройки'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav></div>;
}
