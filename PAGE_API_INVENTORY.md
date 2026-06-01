# Page and API Inventory

This document inventories the routed pages in the app, the local helper functions they use, and every direct API or tRPC call I found in the current workspace.

## Route Map

The client routes are defined in [client/src/App.tsx](client/src/App.tsx#L1).

- `/` -> [Home](client/src/pages/Home.tsx)
- `/contacts` -> [ContactsEntry](client/src/pages/ContactsEntry.tsx)
- `/messaging` -> [MessagingPage](client/src/pages/MessagingPage.tsx)
- `/request-scheduling` -> [RequestScheduling](client/src/pages/RequestScheduling.tsx)
- `/account-entry` -> [AccountEntry](client/src/pages/AccountEntry.tsx)
- `/account` -> [AccountManagement](client/src/pages/AccountManagement.tsx)
- `/integrate` -> [ZapierIntegrationPage](client/src/pages/ZapierIntegrationPage.tsx)
- `/404` and fallback -> [NotFound](client/src/pages/NotFound.tsx)

The app-level tRPC client is created in [client/src/main.tsx](client/src/main.tsx#L1) and points to `/api/trpc` or `${VITE_API_URL}/api/trpc`.

## Page Inventory

### Home

File: [client/src/pages/Home.tsx](client/src/pages/Home.tsx)

Purpose: entry page for adding contacts inside GoHighLevel. It supports three states based on `locationId` and connection status: setup instructions, install prompt, and the connected add-contacts interface.

Local functions and helpers used: `useMemo` for `view` and `locationId`; `connectionQuery.refetch()` for retry and check-again actions.

Direct API usage: `trpc.ghl.connectionStatus.useQuery({ locationId }, { enabled: !!locationId, refetchInterval: 60000 })` -> [ghl.connectionStatus](server/routers/ghl.ts#L101).

Shared components used: [SingleContactForm](client/src/components/SingleContactForm.tsx), [CSVUploadFlow](client/src/components/CSVUploadFlow.tsx), and conditional render of [ContactsPage](client/src/pages/ContactsPage.tsx) when `?view=contacts` is set.

### ContactsPage

File: [client/src/pages/ContactsPage.tsx](client/src/pages/ContactsPage.tsx)

Purpose: read-only contact management screen with search, cursor pagination, status filters, status enrichment, view/edit/delete actions, and connection verification.

Local functions and helpers used: `statusStyles`, `StatusBadge`, `handleSearch`, `handleClear`, `toggleFilter`, `handleOpenMenu`, `handleEditContact`, `handleDeleteContact`, and the `useEffect` block that refreshes contact status for each loaded page of contacts.

Direct API usage: `trpc.ghl.connectionStatus.useQuery({ locationId }, { enabled: !!locationId, refetchInterval: 60000 })` -> [ghl.connectionStatus](server/routers/ghl.ts#L101); `trpc.ghl.listContacts.useQuery({...})` -> [ghl.listContacts](server/routers/ghl.ts#L228); `trpc.ghl.refreshContactStatus.useMutation()` -> [ghl.refreshContactStatus](server/routers/ghl.ts#L352); `trpc.ghl.updateContact.useMutation()` -> [ghl.updateContact](server/routers/ghl.ts#L365); `trpc.ghl.deleteContact.useMutation()` -> [ghl.deleteContact](server/routers/ghl.ts#L399).

Notable indirect behavior: each loaded page of contacts triggers a refresh of contact status, which is then merged into the displayed `smsStatus` and `emailStatus` values before rendering.

### MessagingPage

File: [client/src/pages/MessagingPage.tsx](client/src/pages/MessagingPage.tsx)

Purpose: configure the review-request message template, owner/business metadata, personalized image settings, search a contact, and send a test message preview.

Local functions and helpers used: `buildPersonalizedImageUrl`, `useLocationId`, the `useEffect` that hydrates form state from server context, `handleSave`, `handleSendTest`, and `handleImageSave`.

Direct API usage: `trpc.ghl.connectionStatus.useQuery({ locationId }, { enabled: !!locationId, refetchInterval: 60000 })` -> [ghl.connectionStatus](server/routers/ghl.ts#L101); `trpc.ghl.messagingContext.useQuery({ locationId }, { enabled: !!locationId && connectionQuery.data?.connected === true })` -> [ghl.messagingContext](server/routers/ghl.ts#L241); `trpc.ghl.listContacts.useQuery({ locationId, query: appliedSearch, pageLimit: 20, statusFilters: [] }, { enabled: ... })` -> [ghl.listContacts](server/routers/ghl.ts#L228); `trpc.ghl.updateMessagingSettings.useMutation()` -> [ghl.updateMessagingSettings](server/routers/ghl.ts#L256); `trpc.ghl.sendTestMessage.useMutation()` -> [ghl.sendTestMessage](server/routers/ghl.ts#L281).

Shared component used: [DynamicImagePanel](client/src/components/DynamicImagePanel.tsx), which exposes the image composer used from the modal.

### RequestScheduling

File: [client/src/pages/RequestScheduling.tsx](client/src/pages/RequestScheduling.tsx)

Purpose: control two sliders for review-request timing and follow-up count, preload values from URL or persisted custom values, and save the configuration back to GHL custom values.

Local functions and helpers used: `useLocationAndParams`, `sliderBackground`, `timingCustomValueToIndex`, `serviceTypeToIndex`, `showToast`, and `handleSave`.

Direct API usage: `trpc.requestScheduling.getSettings.useQuery({ locationId }, { enabled: !!locationId })` -> [requestScheduling.getSettings](server/routers/requestScheduling.ts#L21); `trpc.requestScheduling.saveCustomValuesSettings.useMutation()` -> [requestScheduling.saveCustomValuesSettings](server/routers/requestScheduling.ts#L40).

### AccountManagement

File: [client/src/pages/AccountManagement.tsx](client/src/pages/AccountManagement.tsx)

Purpose: tab shell for payment method, update payment, manage users, add user, and close account.

Local functions and helpers used: `setActiveTab`, `useMemo` for `locationId`, and `connectionQuery.refetch()` for retry and check-again actions.

Direct API usage: `trpc.ghl.connectionStatus.useQuery({ locationId }, { enabled: !!locationId, refetchInterval: 60000 })` -> [ghl.connectionStatus](server/routers/ghl.ts#L101).

Tabs loaded by this page and their direct HTTP calls are documented below in the shared component section.

### ZapierIntegrationPage

File: [client/src/pages/ZapierIntegrationPage.tsx](client/src/pages/ZapierIntegrationPage.tsx)

Purpose: show the Zapier connection key, open the Zapier invite flow, rotate the key, and revoke Zapier access.

Local functions and helpers used: `readResponseBody`, `getZapierCliName`, `getInviteUrl`, `buildZapCreateUrl`, `useLocationId`, `loadConnection`, `handleCopyConnectionKey`, `handleIntegrate`, `handleCreateZap`, `handleRotateKey`, `performRotateKey`, and `handleRevoke`.

Direct HTTP usage: `GET /api/zapier/connection?locationId=...`; `POST /api/zapier/connection/rotate`; `POST /api/zapier/connection/revoke`.

Backend route definitions: [server/routes/zapier.ts](server/routes/zapier.ts#L1) registers the endpoints above.

### AccountEntry

File: [client/src/pages/AccountEntry.tsx](client/src/pages/AccountEntry.tsx)

Purpose: redirect-only entry point that normalizes `locationId` and forwards to `/account`.

Local functions and helpers used: the `useEffect` block that reads query parameters and calls `window.location.replace`.

Direct API usage: none.

### ContactsEntry

File: [client/src/pages/ContactsEntry.tsx](client/src/pages/ContactsEntry.tsx)

Purpose: redirect-only entry point that forwards to `/` with `view=contacts` and preserves `locationId`.

Local functions and helpers used: the `useEffect` block that reads query parameters and calls `window.location.replace`.

Direct API usage: none.

### NotFound

File: [client/src/pages/NotFound.tsx](client/src/pages/NotFound.tsx)

Purpose: 404 screen with a single navigation action back to the home route.

Local functions and helpers used: `useLocation` from `wouter` and `handleGoHome`.

Direct API usage: none.

### ComponentShowcase

File: [client/src/pages/ComponentShowcase.tsx](client/src/pages/ComponentShowcase.tsx)

Purpose: demo page for shadcn/ui components and the local AI chat box UI.

Local functions and helpers used: `toggleTheme` from [ThemeContext](client/src/contexts/ThemeContext.tsx), `handleDialogSubmit`, `handleDialogKeyDown`, and `handleChatSend`.

Direct API usage: none at runtime. The AI chat example only shows a commented tRPC usage pattern inside the demo message string, not an actual network call.

## Shared Components and Their Calls

### SingleContactForm

File: [client/src/components/SingleContactForm.tsx](client/src/components/SingleContactForm.tsx)

Functions and helpers used: `validate`, `handleSubmit`, `handleChange`, and the `createContactMutation` success/error handlers.

Direct API usage: `trpc.ghl.createContact.useMutation()` -> [ghl.createContact](server/routers/ghl.ts#L123).

### CSVUploadFlow

File: [client/src/components/CSVUploadFlow.tsx](client/src/components/CSVUploadFlow.tsx)

Functions and helpers used: `handleFileUploaded`, `handleMappingComplete`, `handleBack`, `handleComplete`, `handleDialogClose`, and the internal `StepDot` component.

Direct API usage: none by itself. It delegates to [CSVUpload](client/src/components/CSVUpload.tsx), [ColumnMapping](client/src/components/ColumnMapping.tsx), and [ReviewConfirm](client/src/components/ReviewConfirm.tsx).

### CSVUpload

File: [client/src/components/CSVUpload.tsx](client/src/components/CSVUpload.tsx)

Functions and helpers used: `handleFile`, `handleDragOver`, `handleDragLeave`, `handleDrop`, `handleFileSelect`, and `clearFile`.

Direct API usage: none. It uses `FileReader` and the CSV parser helper `parseCSV(text, file.name)` from [client/src/lib/csv-parser.ts](client/src/lib/csv-parser.ts).

### ColumnMapping

File: [client/src/components/ColumnMapping.tsx](client/src/components/ColumnMapping.tsx)

Functions and helpers used: `handleMappingChange`, `handleRemoveMapping`, `handleNext`, and the `MappingRow` helper.

Direct API usage: none. It uses `autoDetectMappings(headers)` and `validateMappings(mapping)` from [client/src/lib/csv-parser.ts](client/src/lib/csv-parser.ts).

### ReviewConfirm

File: [client/src/components/ReviewConfirm.tsx](client/src/components/ReviewConfirm.tsx)

Functions and helpers used: `handleUpload` and the internal progress/result state.

Direct API usage: `trpc.ghl.processBatch.useMutation()` -> [ghl.processBatch](server/routers/ghl.ts#L164).

It also uses `applyMappings(parsedCSV, mapping)` from [client/src/lib/csv-parser.ts](client/src/lib/csv-parser.ts).

### DynamicImagePanel

File: [client/src/components/DynamicImagePanel.tsx](client/src/components/DynamicImagePanel.tsx)

Functions and helpers used: `DraggableTextOverlay`, `fileToBase64`, `handleFile`, `refreshPreview`, the preview debounce effect, `handleSave`, `copyUrl`, `handleUseImage`, `onDrop`, and `updateOverlayConfig`.

Direct API usage: `trpc.dynamicImage.previewComposite.useMutation()` -> [dynamicImage.previewComposite](server/routers/dynamicImage.ts#L1); `trpc.dynamicImage.saveAndUpdateContact.useMutation()` -> [dynamicImage.saveAndUpdateContact](server/routers/dynamicImage.ts#L1).

Generated endpoint usage: the saved template points to `GET /api/dynamic-image/*`, which is implemented by [server/routes/dynamicImageRender.ts](server/routes/dynamicImageRender.ts#L1).

### AccountAuthProvider

File: [client/src/contexts/AccountAuthContext.tsx](client/src/contexts/AccountAuthContext.tsx)

Functions and helpers used: `fetchLocationToken`, `retryTokenFetch`, and the initial `useEffect` that validates `locationId`.

Direct HTTP usage: `GET /api/auth/location-token?locationId=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### PaymentMethodTab

File: [client/src/components/account/PaymentMethodTab.tsx](client/src/components/account/PaymentMethodTab.tsx)

Functions and helpers used: `fetchPlanData`, `fetchTransactions`, `handlePreviousPage`, `handleNextPage`, the `useMemo` filters for invoices and charges, and the card/account rendering helpers.

Direct HTTP usage: `GET /api/saas/plan?locationId=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `GET /api/account/transactions?locationId=...&limit=...&offset=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### UpdatePaymentTab

File: [client/src/components/account/UpdatePaymentTab.tsx](client/src/components/account/UpdatePaymentTab.tsx)

Functions and helpers used: `fetchCurrentPlan`, `handleSaveProfile`, `PaymentDrawer`, and the field-level input helpers.

Direct HTTP usage: `GET /api/saas/plan?locationId=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### ManageUsersTab

File: [client/src/components/account/ManageUsersTab.tsx](client/src/components/account/ManageUsersTab.tsx)

Functions and helpers used: `fetchUsers`, the search filter effect, `handleEditClick`, `handleDeleteClick`, `handleSaveUser`, and `handleConfirmDelete`.

Direct HTTP usage: `GET /api/account/users?locationId=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `GET /api/account/users/:userId?locationId=...` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `PUT /api/account/users/:userId` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `DELETE /api/account/users/:userId` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### AddUserTab

File: [client/src/components/account/AddUserTab.tsx](client/src/components/account/AddUserTab.tsx)

Functions and helpers used: `handleChange`, `handlePermissionToggle`, `validateForm`, and `handleSubmit`.

Direct HTTP usage: `POST /api/account/users` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### CloseAccountTab

File: [client/src/components/account/CloseAccountTab.tsx](client/src/components/account/CloseAccountTab.tsx)

Functions and helpers used: `handleCancelSubscription`, `handlePauseAccount`, `handleDeleteAccount`, and the confirmation modal state.

Direct HTTP usage: `POST /api/saas/disable` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `POST /api/saas/pause` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1); `DELETE /api/location/delete` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1).

### AIChatBox

File: [client/src/components/AIChatBox.tsx](client/src/components/AIChatBox.tsx)

Functions and helpers used: `handleSubmit`, `handleKeyDown`, `scrollToBottom`, the `useEffect` that computes minimum height, and the message rendering logic.

Direct API usage: none in the component itself. The tRPC example in the JSDoc comment is documentation only, not a live call site.

## Endpoint Inventory

### tRPC procedures currently used by client pages/components

- `ghl.connectionStatus` -> [server/routers/ghl.ts](server/routers/ghl.ts#L101)
- `ghl.createContact` -> [server/routers/ghl.ts](server/routers/ghl.ts#L123)
- `ghl.processBatch` -> [server/routers/ghl.ts](server/routers/ghl.ts#L164)
- `ghl.listContacts` -> [server/routers/ghl.ts](server/routers/ghl.ts#L228)
- `ghl.messagingContext` -> [server/routers/ghl.ts](server/routers/ghl.ts#L241)
- `ghl.updateMessagingSettings` -> [server/routers/ghl.ts](server/routers/ghl.ts#L256)
- `ghl.sendTestMessage` -> [server/routers/ghl.ts](server/routers/ghl.ts#L281)
- `ghl.refreshContactStatus` -> [server/routers/ghl.ts](server/routers/ghl.ts#L352)
- `ghl.updateContact` -> [server/routers/ghl.ts](server/routers/ghl.ts#L365)
- `ghl.deleteContact` -> [server/routers/ghl.ts](server/routers/ghl.ts#L399)
- `requestScheduling.getSettings` -> [server/routers/requestScheduling.ts](server/routers/requestScheduling.ts#L21)
- `requestScheduling.saveCustomValuesSettings` -> [server/routers/requestScheduling.ts](server/routers/requestScheduling.ts#L40)
- `dynamicImage.previewComposite` -> [server/routers/dynamicImage.ts](server/routers/dynamicImage.ts#L1)
- `dynamicImage.saveAndUpdateContact` -> [server/routers/dynamicImage.ts](server/routers/dynamicImage.ts#L1)

### HTTP routes currently used by client pages/components

- `GET /api/auth/location-token` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `GET /api/saas/plan` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `GET /api/account/transactions` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `GET /api/account/users` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `GET /api/account/users/:userId` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `POST /api/account/users` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `PUT /api/account/users/:userId` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `DELETE /api/account/users/:userId` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `POST /api/saas/disable` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `POST /api/saas/pause` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `DELETE /api/location/delete` -> [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)
- `GET /api/zapier/connection` -> [server/routes/zapier.ts](server/routes/zapier.ts#L1)
- `POST /api/zapier/connection/rotate` -> [server/routes/zapier.ts](server/routes/zapier.ts#L1)
- `POST /api/zapier/connection/revoke` -> [server/routes/zapier.ts](server/routes/zapier.ts#L1)
- `GET /api/dynamic-image/*` -> [server/routes/dynamicImageRender.ts](server/routes/dynamicImageRender.ts#L1)

### Backend routes present but not directly called by the routed client pages in this inventory

- `system.health` and `system.notifyOwner` from [server/_core/systemRouter.ts](server/_core/systemRouter.ts#L1)
- `ghl.listInstallations`, `ghl.verifyConnection`, `ghl.getPipelines`, `ghl.getContact`, `ghl.hasWonOpportunity` from [server/routers/ghl.ts](server/routers/ghl.ts#L1)
- `GET /api/zapier/auth/test`, `POST /api/zapier/auth/test`, `POST /api/zapier/contacts/upsert`, and `POST /api/create-contact` from [server/routes/zapier.ts](server/routes/zapier.ts#L1)
- `GET /api/saas/plans`, `POST /api/verify-location`, and `PUT /api/saas/update-subscription` from [server/routes/accountManagement.ts](server/routes/accountManagement.ts#L1)

## Notes

- The client bootstraps tRPC in [client/src/main.tsx](client/src/main.tsx#L1) and wraps the app with the React Query provider.
- The route tree is intentionally thin; most real behavior lives in the page components and the shared account, CSV, and image helpers.
- The `ComponentShowcase` page is present in the workspace but is not mounted in [client/src/App.tsx](client/src/App.tsx#L1).