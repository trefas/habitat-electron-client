<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from './api';
  import type {
    AppNotification,
    Message,
    MessageListResponse,
    MessageRecipient,
    NotificationListResponse,
  } from './types';

  const dispatch = createEventDispatcher();

  type Mailbox = 'inbox' | 'sent' | 'all';
  type Tab = Mailbox | 'notifications';

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

  let tab: Tab = 'inbox';
  let messages: Message[] = [];
  let total = 0;
  let limit = 20;
  let offset = 0;
  let isLoadingMessages = false;
  let messagesError = '';
  let notice = '';

  let notifications: AppNotification[] = [];
  let notificationTotal = 0;
  let notificationOffset = 0;
  let notificationLimit = 20;
  let unreadOnly = true;
  let isLoadingNotifications = false;
  let notificationsError = '';
  let unreadCount = 0;

  let composeOpen = false;
  let composeText = '';
  let composeRecipients = '';
  let composeError = '';
  let isSending = false;

  let selected: Message | null = null;
  let detailOpen = false;
  let detailError = '';
  let isLoadingDetail = false;
  let shareRecipients = '';
  let shareError = '';
  let shareNotice = '';
  let isSharing = false;

  const messageOf = (error: any) =>
    error?.message || 'Не удалось выполнить запрос';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('ru-RU') : '—';

  const parseRecipients = (raw: string): string[] =>
    Array.from(
      new Set(
        raw
          .split(/[\s,;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

  const senderLabel = (message: Message) =>
    message.is_owner ? 'Вы' : message.sender.display_name || message.sender.email;

  const statusLabel = (message: Message) => {
    if (message.is_owner) {
      return `Прочитали ${message.read_count} из ${message.recipients_count}`;
    }
    return message.is_read ? 'Прочитано' : 'Не прочитано';
  };

  const statusClass = (message: Message) =>
    message.is_owner || message.is_read ? 'badge-active' : 'badge-pending';

  const pageNumber = () => Math.floor(offset / limit) + 1;
  const totalPages = () => Math.max(1, Math.ceil(total / limit));

  const notificationPageNumber = () => Math.floor(notificationOffset / notificationLimit) + 1;
  const notificationTotalPages = () =>
    Math.max(1, Math.ceil(notificationTotal / notificationLimit));

  const loadMessages = async () => {
    isLoadingMessages = true;
    messagesError = '';

    const params = new URLSearchParams({
      box: tab === 'notifications' ? 'inbox' : tab,
      limit: String(limit),
      offset: String(offset),
    });

    try {
      const data: MessageListResponse = await api.get(`/api/v1/messages?${params.toString()}`);
      messages = data.items || [];
      total = data.total || 0;
    } catch (error: any) {
      messagesError = messageOf(error);
    } finally {
      isLoadingMessages = false;
    }
  };

  const loadUnreadCount = async () => {
    try {
      const data: NotificationListResponse = await api.get(
        '/api/v1/notifications?unread=true&limit=1&offset=0',
      );
      unreadCount = data.total || 0;
    } catch {
      unreadCount = 0;
    }
  };

  const loadNotifications = async () => {
    isLoadingNotifications = true;
    notificationsError = '';

    const params = new URLSearchParams({
      unread: String(unreadOnly),
      limit: String(notificationLimit),
      offset: String(notificationOffset),
    });

    try {
      const data: NotificationListResponse = await api.get(
        `/api/v1/notifications?${params.toString()}`,
      );
      notifications = data.items || [];
      notificationTotal = data.total || 0;
      await loadUnreadCount();
    } catch (error: any) {
      notificationsError = messageOf(error);
    } finally {
      isLoadingNotifications = false;
    }
  };

  const refreshActive = () => {
    notice = '';
    if (tab === 'notifications') {
      void loadNotifications();
    } else {
      void loadMessages();
    }
  };

  const switchTab = (next: Tab) => {
    if (tab === next) return;
    tab = next;
    notice = '';
    messagesError = '';
    notificationsError = '';
    if (next === 'notifications') {
      notificationOffset = 0;
      void loadNotifications();
    } else {
      offset = 0;
      void loadMessages();
    }
  };

  const changePageSize = () => {
    offset = 0;
    void loadMessages();
  };

  const goToPreviousPage = () => {
    if (offset === 0) return;
    offset = Math.max(0, offset - limit);
    void loadMessages();
  };

  const goToNextPage = () => {
    if (offset + limit >= total) return;
    offset += limit;
    void loadMessages();
  };

  const openCompose = () => {
    composeText = '';
    composeRecipients = '';
    composeError = '';
    composeOpen = true;
  };

  const closeCompose = () => {
    if (isSending) return;
    composeOpen = false;
  };

  const sendMessage = async () => {
    composeError = '';

    const text = composeText.trim();
    const recipients = parseRecipients(composeRecipients);

    if (!text) {
      composeError = 'Введите текст сообщения';
      return;
    }
    if (text.length > 20000) {
      composeError = 'Сообщение не должно превышать 20 000 символов';
      return;
    }
    if (recipients.length === 0) {
      composeError = 'Укажите хотя бы одного получателя';
      return;
    }

    isSending = true;
    try {
      await api.post('/api/v1/messages', { text, recipients });
      composeOpen = false;
      tab = 'sent';
      offset = 0;
      await loadMessages();
      notice = 'Сообщение отправлено.';
    } catch (error: any) {
      composeError = messageOf(error);
    } finally {
      isSending = false;
    }
  };

  const loadMessageDetail = async (id: string) => {
    isLoadingDetail = true;
    detailError = '';
    try {
      const data: Message = await api.get(`/api/v1/messages/${id}`);
      if (selected?.id === id) {
        selected = data;
      }
    } catch (error: any) {
      detailError = messageOf(error);
    } finally {
      isLoadingDetail = false;
    }
  };

  const markSelectedRead = async (id: string) => {
    try {
      await api.post(`/api/v1/messages/${id}/read`);
      if (selected?.id === id) {
        selected = { ...selected, is_read: true, read_at: new Date().toISOString() };
      }
      messages = messages.map((message) =>
        message.id === id ? { ...message, is_read: true, read_at: new Date().toISOString() } : message,
      );
    } catch (error: any) {
      detailError = messageOf(error);
    }
  };

  const openMessage = async (message: Message) => {
    selected = message;
    detailOpen = true;
    detailError = '';
    shareError = '';
    shareNotice = '';
    shareRecipients = '';

    if (message.is_owner) {
      await loadMessageDetail(message.id);
    } else if (!message.is_read) {
      await markSelectedRead(message.id);
    }
  };

  const closeDetail = () => {
    if (isSharing) return;
    detailOpen = false;
    selected = null;
    if (tab !== 'notifications') {
      void loadMessages();
    }
  };

  const shareMessage = async () => {
    if (!selected) return;

    shareError = '';
    shareNotice = '';
    const recipients = parseRecipients(shareRecipients);

    if (recipients.length === 0) {
      shareError = 'Укажите хотя бы одного получателя';
      return;
    }

    isSharing = true;
    try {
      const data: { items: MessageRecipient[] } = await api.post(
        `/api/v1/messages/${selected.id}/shares`,
        { recipients },
      );
      selected = {
        ...selected,
        recipients: data.items || [],
        recipients_count: (data.items || []).length,
      };
      shareRecipients = '';
      shareNotice = 'Доступ выдан.';
      await loadMessages();
    } catch (error: any) {
      shareError = messageOf(error);
    } finally {
      isSharing = false;
    }
  };

  const revokeRecipient = async (recipient: MessageRecipient) => {
    if (!selected) return;

    const confirmed = window.confirm(
      `Отозвать доступ у ${recipient.display_name || recipient.email}?`,
    );
    if (!confirmed) return;

    shareError = '';
    shareNotice = '';
    const messageId = selected.id;

    try {
      await api.delete(`/api/v1/messages/${messageId}/shares/${recipient.user_id}`);
      await loadMessageDetail(messageId);
      await loadMessages();
      shareNotice = 'Доступ отозван.';
    } catch (error: any) {
      shareError = messageOf(error);
    }
  };

  const markNotificationRead = async (notification: AppNotification) => {
    try {
      await api.post(`/api/v1/notifications/${notification.id}/read`);
      if (unreadOnly) {
        notifications = notifications.filter((item) => item.id !== notification.id);
        notificationTotal = Math.max(0, notificationTotal - 1);
      } else {
        notifications = notifications.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item,
        );
      }
      unreadCount = Math.max(0, unreadCount - 1);
    } catch (error: any) {
      notificationsError = messageOf(error);
    }
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.entity_id) return;

    try {
      if (!notification.is_read) {
        await markNotificationRead(notification);
      }

      if (notification.payload?.entity_type === 'list') {
        if (notification.kind !== 'share_revoked') {
          dispatch('openList', { id: notification.entity_id });
        }
        return;
      }

      const message: Message = await api.get(`/api/v1/messages/${notification.entity_id}`);
      await openMessage(message);
    } catch (error: any) {
      notificationsError = messageOf(error);
    }
  };

  const notificationKindLabel = (notification: AppNotification) => {
    switch (notification.kind) {
      case 'share_received':
        return notification.payload?.entity_type === 'list'
          ? 'Доступ к списку'
          : 'Доступ к сообщению';
      case 'share_revoked':
        return 'Доступ отозван';
      case 'share_expiring':
        return 'Доступ скоро истечёт';
      case 'entity_copied':
        return 'Создана копия';
      case 'entity_updated':
        return 'Сущность обновлена';
      default:
        return notification.kind;
    }
  };

  const notificationPreview = (notification: AppNotification) =>
    notification.payload?.text_preview || notificationKindLabel(notification);

  onMount(() => {
    void loadMessages();
    void loadUnreadCount();
  });
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Сообщения</h1>
      <p class="page-subtitle">
        Одиночные сообщения, отчёты о прочтении и входящие уведомления.
      </p>
    </div>
    <div class="page-actions">
      <button class="secondary" on:click={() => dispatch('back')}>Назад</button>
      <button class="logout-btn" on:click={() => dispatch('logout')}>Выйти</button>
    </div>
  </header>

  <section class="card">
    <div class="messages-toolbar">
      <div class="tab-row" role="tablist" aria-label="Разделы сообщений">
        <button class="tab-btn" class:active={tab === 'inbox'} on:click={() => switchTab('inbox')}>
          Входящие
        </button>
        <button class="tab-btn" class:active={tab === 'sent'} on:click={() => switchTab('sent')}>
          Отправленные
        </button>
        <button class="tab-btn" class:active={tab === 'all'} on:click={() => switchTab('all')}>
          Все
        </button>
        <button
          class="tab-btn"
          class:active={tab === 'notifications'}
          on:click={() => switchTab('notifications')}
        >
          Уведомления
          {#if unreadCount > 0}
            <span class="unread-badge">{unreadCount}</span>
          {/if}
        </button>
      </div>

      <div class="messages-actions">
        <button on:click={openCompose}>Написать</button>
        <button class="secondary" on:click={refreshActive}>Обновить</button>
      </div>
    </div>

    {#if notice}
      <p class="success-message">{notice}</p>
    {/if}

    {#if tab === 'notifications'}
      <div class="notifications-toolbar">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={unreadOnly} on:change={loadNotifications} />
          Только непрочитанные
        </label>
        <span class="hint">Всего: {notificationTotal}</span>
      </div>

      {#if notificationsError}
        <p class="error-message">{notificationsError}</p>
      {/if}

      {#if isLoadingNotifications}
        <p class="loading-text">Загрузка уведомлений...</p>
      {:else if notifications.length === 0}
        <p class="empty-state">Уведомлений нет.</p>
      {:else}
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Тип</th>
                <th>Сообщение</th>
                <th>Дата</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each notifications as item (item.id)}
                <tr class:unread-row={!item.is_read}>
                  <td>{notificationKindLabel(item)}</td>
                  <td class="message-preview">{notificationPreview(item)}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <span class="badge {item.is_read ? 'badge-active' : 'badge-pending'}">
                      {item.is_read ? 'Прочитано' : 'Не прочитано'}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      {#if item.entity_id}
                        <button class="secondary small-btn" on:click={() => openNotification(item)}>
                          Открыть
                        </button>
                      {/if}
                      {#if !item.is_read}
                        <button class="small-btn" on:click={() => markNotificationRead(item)}>
                          Прочитать
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <button
            class="secondary small-btn"
            on:click={() => {
              notificationOffset = Math.max(0, notificationOffset - notificationLimit);
              void loadNotifications();
            }}
            disabled={notificationOffset === 0}
          >
            Назад
          </button>
          <span>
            Страница {notificationPageNumber()} из {notificationTotalPages()}
          </span>
          <button
            class="secondary small-btn"
            on:click={() => {
              notificationOffset += notificationLimit;
              void loadNotifications();
            }}
            disabled={notificationOffset + notificationLimit >= notificationTotal}
          >
            Вперёд
          </button>
        </div>
      {/if}
    {:else}
      {#if messagesError}
        <p class="error-message">{messagesError}</p>
      {/if}

      {#if isLoadingMessages}
        <p class="loading-text">Загрузка сообщений...</p>
      {:else if messages.length === 0}
        <p class="empty-state">В этой папке пока нет сообщений.</p>
      {:else}
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Отправитель</th>
                <th>Текст</th>
                <th>Дата</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each messages as message (message.id)}
                <tr class:unread-row={!message.is_owner && !message.is_read}>
                  <td>
                    <strong>{senderLabel(message)}</strong>
                    {#if message.is_owner}
                      <div class="hint">Получателей: {message.recipients_count}</div>
                    {:else}
                      <div class="hint">{message.sender.email}</div>
                    {/if}
                  </td>
                  <td class="message-preview">{message.text}</td>
                  <td>{formatDate(message.created_at)}</td>
                  <td>
                    <span class="badge {statusClass(message)}">{statusLabel(message)}</span>
                  </td>
                  <td>
                    <button class="secondary small-btn" on:click={() => openMessage(message)}>
                      Открыть
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span>Всего: {total}</span>
          <button class="secondary small-btn" on:click={goToPreviousPage} disabled={offset === 0}>
            Назад
          </button>
          <span>Страница {pageNumber()} из {totalPages()}</span>
          <button
            class="secondary small-btn"
            on:click={goToNextPage}
            disabled={offset + limit >= total}
          >
            Вперёд
          </button>
          <select bind:value={limit} on:change={changePageSize} aria-label="Размер страницы">
            {#each PAGE_SIZE_OPTIONS as size}
              <option value={size}>{size} на странице</option>
            {/each}
          </select>
        </div>
      {/if}
    {/if}
  </section>
</div>

{#if composeOpen}
  <div class="modal-overlay" role="presentation" on:click|self={closeCompose}>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <h2 id="compose-title">Новое сообщение</h2>
      <p class="modal-subtitle">
        Получатели задаются email или UUID. Можно указать несколько через запятую или с новой строки.
      </p>

      <form on:submit|preventDefault={sendMessage}>
        <div class="form-group">
          <label for="compose-recipients">Получатели</label>
          <textarea
            id="compose-recipients"
            rows="3"
            placeholder="alice@example.com, bob@example.com"
            bind:value={composeRecipients}
          ></textarea>
        </div>

        <div class="form-group">
          <label for="compose-text">Текст</label>
          <textarea
            id="compose-text"
            rows="6"
            maxlength="20000"
            placeholder="Введите сообщение..."
            bind:value={composeText}
          ></textarea>
          <span class="hint">{composeText.length} / 20000</span>
        </div>

        {#if composeError}
          <p class="error-message">{composeError}</p>
        {/if}

        <div class="buttons">
          <button type="submit" disabled={isSending}>
            {isSending ? 'Отправка...' : 'Отправить'}
          </button>
          <button type="button" class="secondary" on:click={closeCompose} disabled={isSending}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if detailOpen && selected}
  <div class="modal-overlay" role="presentation" on:click|self={closeDetail}>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="message-title">
      <div class="card-header">
        <h2 id="message-title">Сообщение</h2>
        <button class="secondary small-btn" on:click={closeDetail} disabled={isSharing}>
          Закрыть
        </button>
      </div>

      <p class="modal-subtitle">
        {selected.sender.display_name || selected.sender.email} · {selected.sender.email}
      </p>
      <p class="hint">{formatDate(selected.created_at)}</p>

      <div class="message-body">{selected.text}</div>

      <p class="message-status">
        <span class="badge {statusClass(selected)}">{statusLabel(selected)}</span>
      </p>

      {#if detailError}
        <p class="error-message">{detailError}</p>
      {/if}

      {#if selected.is_owner}
        <section class="detail-section">
          <h3>Получатели</h3>
          {#if isLoadingDetail}
            <p class="loading-text">Обновление списка...</p>
          {/if}

          {#if selected.recipients && selected.recipients.length > 0}
            <div class="recipient-list">
              {#each selected.recipients as recipient (recipient.user_id)}
                <div class="recipient-row">
                  <div>
                    <strong>{recipient.display_name || recipient.email}</strong>
                    <div class="hint">{recipient.email}</div>
                  </div>
                  <span class="badge {recipient.is_read ? 'badge-active' : 'badge-pending'}">
                    {recipient.is_read
                      ? `Прочитано ${formatDate(recipient.read_at)}`
                      : 'Не прочитано'}
                  </span>
                  <button
                    class="danger-btn small-btn"
                    on:click={() => revokeRecipient(recipient)}
                    disabled={isSharing}
                  >
                    Отозвать
                  </button>
                </div>
              {/each}
            </div>
          {:else if !isLoadingDetail}
            <p class="empty-state">Получателей нет.</p>
          {/if}

          <form class="share-form" on:submit|preventDefault={shareMessage}>
            <div class="form-group">
              <label for="share-recipients">Поделиться с</label>
              <input
                id="share-recipients"
                type="text"
                placeholder="email или UUID"
                bind:value={shareRecipients}
              />
            </div>
            <button type="submit" class="secondary small-btn" disabled={isSharing}>
              {isSharing ? 'Выдача доступа...' : 'Выдать доступ'}
            </button>
          </form>

          {#if shareError}
            <p class="error-message">{shareError}</p>
          {/if}
          {#if shareNotice}
            <p class="success-message">{shareNotice}</p>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}
