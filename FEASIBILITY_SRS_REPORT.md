# Feasibility and SRS Report

## 1. Purpose

This document describes the current product surface, the functional scope already implemented, the backend integrations in use, and the practical feasibility considerations for expanding the system.

It is written as a planning reference for product, engineering, and implementation review.

Primary source inventory: [PAGE_API_INVENTORY.md](PAGE_API_INVENTORY.md)

## 2. Product Summary

The application is a GoHighLevel-connected review and contact operations tool. It currently provides these major user-facing areas:

- Contact capture and bulk CSV import
- Contact browsing and contact-level maintenance
- Review request messaging configuration and test sending
- Request scheduling configuration through custom values
- Account management for billing and users
- Zapier connection management

The app is routed through [client/src/App.tsx](client/src/App.tsx) and uses tRPC plus a small set of direct HTTP endpoints for non-tRPC flows.

## 3. Current Scope by Page

### 3.1 Home

Reference: [client/src/pages/Home.tsx](client/src/pages/Home.tsx)

Current functionality:

- Checks whether the current `locationId` is connected.
- Shows setup instructions if `locationId` is missing.
- Shows an installation prompt if the GHL app is not connected.
- Shows the main add-contacts interface when connected.
- Hosts the single-contact entry form and CSV bulk upload flow.
- Supports switching into the contacts view by `view=contacts`.

Business value:

- This is the main operational entry point for the app.
- It handles both light usage and bulk onboarding of contacts.

### 3.2 Contacts

Reference: [client/src/pages/ContactsPage.tsx](client/src/pages/ContactsPage.tsx)

Current functionality:

- Lists contacts for a location.
- Supports search and status filters.
- Uses cursor-based pagination.
- Refreshes per-contact status using opportunity checks.
- Allows editing and deleting a contact.

Business value:

- This becomes the operational control panel for reviewing imported or existing contacts.
- It already supports the workflow needed for data correction and contact cleanup.

### 3.3 Messaging

Reference: [client/src/pages/MessagingPage.tsx](client/src/pages/MessagingPage.tsx)

Current functionality:

- Loads messaging context from the backend.
- Allows editing owner name, business name, custom message, and personalized image settings.
- Searches contacts to choose a test recipient.
- Sends a test review-request message.
- Renders an image preview and a message preview.

Business value:

- This is the most important retention and review-generation workflow.
- It combines template control, preview, and live test delivery.

### 3.4 Request Scheduling

Reference: [client/src/pages/RequestScheduling.tsx](client/src/pages/RequestScheduling.tsx)

Current functionality:

- Lets users choose the initial request delay.
- Lets users define the number of follow-up requests.
- Loads values from URL parameters or stored custom values.
- Persists settings back to GHL custom values.

Business value:

- This provides workflow timing control without manual backend editing.
- It is directly tied to automation behavior inside GHL.

### 3.5 Account Management

Reference: [client/src/pages/AccountManagement.tsx](client/src/pages/AccountManagement.tsx)

Current functionality:

- Verifies the connected location.
- Hosts tabs for payment method, payment update, user management, and account closure.
- Delegates actual work to tab components.

Business value:

- This is the administrative console for SaaS operations.
- It supports lifecycle actions for billing and account administration.

### 3.6 Zapier Integration

Reference: [client/src/pages/ZapierIntegrationPage.tsx](client/src/pages/ZapierIntegrationPage.tsx)

Current functionality:

- Loads the Zapier connection state.
- Shows a connection key and copy action.
- Supports key rotation.
- Supports revoking Zapier access.
- Opens invite/create flows for Zapier automation.

Business value:

- This is the external automation integration layer.
- It broadens the product from a single-app workflow tool to a connectable platform.

## 4. Functional Requirements

### 4.1 Contact Capture

Current implementation:

- Single contact form via [client/src/components/SingleContactForm.tsx](client/src/components/SingleContactForm.tsx)
- CSV bulk upload via [client/src/components/CSVUploadFlow.tsx](client/src/components/CSVUploadFlow.tsx)

Observed requirements:

- Accept `firstName`, `lastName`, `email`, `phone`, and DND flag for single contact creation.
- Validate consent before sending contact data into messaging workflows.
- Support CSV parsing, column mapping, preview, and batch import.
- Support DND behavior on bulk and single import.

### 4.2 Contact Review and Maintenance

Current implementation:

- Contacts list and actions via [client/src/pages/ContactsPage.tsx](client/src/pages/ContactsPage.tsx)

Observed requirements:

- Search contacts.
- Filter by status.
- View, edit, and delete contact records.
- Recompute derived review status.

### 4.3 Messaging Configuration

Current implementation:

- Messaging page and dynamic image panel via [client/src/pages/MessagingPage.tsx](client/src/pages/MessagingPage.tsx) and [client/src/components/DynamicImagePanel.tsx](client/src/components/DynamicImagePanel.tsx)

Observed requirements:

- Maintain owner and business identity fields.
- Maintain a reusable custom message template.
- Support personalized image preview and template generation.
- Send a test message to a selected contact.

### 4.4 Workflow Scheduling

Current implementation:

- Request scheduling page via [client/src/pages/RequestScheduling.tsx](client/src/pages/RequestScheduling.tsx)

Observed requirements:

- Store initial delay and follow-up count in GHL custom values.
- Map slider values to stable business labels and stored values.
- Load defaults from URL or backend data.

### 4.5 Account Administration

Current implementation:

- Account management shell and tabs under [client/src/components/account/](client/src/components/account/)

Observed requirements:

- View billing state.
- Add or replace a payment method.
- List, create, update, and delete users.
- Pause, disable, or delete an account.

### 4.6 Zapier Automation

Current implementation:

- Zapier integration page via [client/src/pages/ZapierIntegrationPage.tsx](client/src/pages/ZapierIntegrationPage.tsx)

Observed requirements:

- Provision and display a connection key.
- Rotate credentials safely.
- Revoke access when needed.
- Support an external Zapier invite flow.

## 5. API and Integration Surface

### 5.1 tRPC Procedures in Active Use

- `ghl.connectionStatus`
- `ghl.createContact`
- `ghl.processBatch`
- `ghl.listContacts`
- `ghl.messagingContext`
- `ghl.updateMessagingSettings`
- `ghl.sendTestMessage`
- `ghl.refreshContactStatus`
- `ghl.updateContact`
- `ghl.deleteContact`
- `requestScheduling.getSettings`
- `requestScheduling.saveCustomValuesSettings`
- `dynamicImage.previewComposite`
- `dynamicImage.saveAndUpdateContact`

These procedures are defined in [server/routers/ghl.ts](server/routers/ghl.ts), [server/routers/requestScheduling.ts](server/routers/requestScheduling.ts), and [server/routers/dynamicImage.ts](server/routers/dynamicImage.ts).

### 5.2 HTTP Endpoints in Active Use

Current client-facing direct HTTP calls include:

- `/api/auth/location-token`
- `/api/saas/plan`
- `/api/account/transactions`
- `/api/account/users`
- `/api/account/users/:userId`
- `/api/saas/disable`
- `/api/saas/pause`
- `/api/location/delete`
- `/api/zapier/connection`
- `/api/zapier/connection/rotate`
- `/api/zapier/connection/revoke`
- `/api/dynamic-image/*`

The route registrations live in [server/routes/accountManagement.ts](server/routes/accountManagement.ts), [server/routes/zapier.ts](server/routes/zapier.ts), and [server/routes/dynamicImageRender.ts](server/routes/dynamicImageRender.ts).

### 5.3 Important Shared Helpers

- CSV parser and mapping helpers in [client/src/lib/csv-parser.ts](client/src/lib/csv-parser.ts)
- Backend URL helper in [client/src/lib/backend.ts](client/src/lib/backend.ts)
- tRPC client bootstrap in [client/src/main.tsx](client/src/main.tsx)
- Account auth context in [client/src/contexts/AccountAuthContext.tsx](client/src/contexts/AccountAuthContext.tsx)
- Image compositor and storage flow in [server/services/imageCompositor.ts](server/services/imageCompositor.ts) and [server/routes/dynamicImageRender.ts](server/routes/dynamicImageRender.ts)

## 6. Feasibility Assessment

### 6.1 Technical Feasibility

Overall assessment: high.

Reasons:

- The system already has a clear page boundary structure.
- Most user actions are already isolated into reusable components.
- tRPC provides a consistent RPC layer for the main product flows.
- Direct HTTP endpoints are confined to account, Zapier, and dynamic image paths.
- The codebase already separates client, server routers, shared types, and helpers.

### 6.2 Product Feasibility

Overall assessment: high, with some integration dependencies.

Reasons:

- The primary workflows already exist end to end.
- The app can be extended by adding new pages or new procedures without rewriting the core shell.
- The current architecture supports incremental expansion.

### 6.3 Operational Feasibility

Overall assessment: medium to high.

Reasons:

- The app depends on external services like GHL, storage, and Zapier.
- Some flows require secure credentials and environment configuration.
- Billing and account management are coupled to SaaS backends, so changes there need careful testing.

## 7. Expansion Readiness

The current structure is suitable for expansion in these directions:

1. Add more contact analytics or contact lifecycle tools.
2. Add deeper workflow editing and automation controls.
3. Add more messaging templates, scheduling presets, or rule-based personalization.
4. Add admin dashboards for install health, usage, and conversion metrics.
5. Add more external integrations beyond Zapier.

The existing codebase already has the pattern needed for this:

- Page shell -> feature component -> shared helper -> tRPC or HTTP backend.

## 8. Risks and Constraints

### 8.1 Integration Risk

The product relies on multiple external systems, so API contract changes or auth changes can break core flows.

### 8.2 Permission and Identity Risk

Several paths depend on valid `locationId` resolution and installed GHL state. Invalid or missing location context is a common failure mode.

### 8.3 Complexity Risk

Account management and image generation are the most complex surfaces. They mix UI state, remote calls, and service-side behavior.

### 8.4 Data Consistency Risk

Contact status is derived in more than one place. If future features rely on the same status logic, that logic should be centralized.

## 9. Recommended Expansion Plan

If the goal is to expand this into a larger product, the cleanest order is:

1. Standardize shared feature contracts for contacts, messaging, and scheduling.
2. Add a domain service layer for reuse across pages.
3. Centralize route constants and endpoint documentation.
4. Introduce permission-aware feature flags for admin-only functions.
5. Add integration tests around the highest-risk flows: contact import, messaging, account actions, and Zapier key lifecycle.

## 10. Suggested Next Deliverables

- A full functional specification with user stories and acceptance criteria.
- A module-by-module architecture diagram.
- A backlog of expansion features ranked by engineering effort and business value.
- A test strategy covering the current tRPC and HTTP surface.

## 11. Summary

This system is already structured in a way that supports growth. The routed pages are focused, the backend surface is reasonably well-separated, and the major workflows are clear.

The main expansion challenge is not the UI shell. It is keeping integration behavior, auth, and derived contact state consistent as more capabilities are added.