/**
 * SunPower Ops - OpenAPI 3.1.0 Generator (Spec 6.3 Phase 9, TRD 2.6, D17)
 * Generates comprehensive OpenAPI specification from the shared Zod contracts and routes.
 */

export function generateOpenApiSpec(): Record<string, any> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SunPower Ops (SolarOS) API',
      version: '1.1.0',
      description:
        'Production REST API for SunPower Solar Installation Management System. ' +
        'Covers the full lifecycle from lead capture, site assessment, quotation, ' +
        'order confirmation, inventory tracking, dispatch, installation sign-off, ' +
        'warranty tracking, service desk ticketing, and executive analytics.',
      contact: {
        name: 'SunPower Engineering Team',
        email: 'ops@sunpowerops.in',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Current Environment API Base',
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Local Development Server',
      },
      {
        url: 'https://staging.sunpowerops.in/api/v1',
        description: 'Staging Server',
      },
    ],
    components: {
      securitySchemes: {
        SessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'authjs.session-token',
          description: 'Staff authentication session cookie (Argon2id + database session)',
        },
        CustomerPortalToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: '128-bit Token',
          description: '128-bit cryptographically random token used for customer portal and public quote views',
        },
        CronSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Bearer token for system cron jobs (Outbox, Predictive Maintenance)',
        },
      },
      schemas: {
        AppError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_FAILED' },
                message: { type: 'string', example: 'Invalid input parameters' },
                details: { type: 'object' },
                requestId: { type: 'string', example: 'req-1698765432' },
              },
              required: ['code', 'message'],
            },
          },
        },
        CreateEnquiryInput: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Kishore Patel' },
            phone: { type: 'string', example: '+919876543210' },
            address: { type: 'string', example: '12 Shivalik Park, Satellite' },
            city: { type: 'string', example: 'Ahmedabad' },
            pincode: { type: 'string', example: '380015' },
            monthlyBillRupees: { type: 'number', example: 4500 },
            sanctionedLoadKw: { type: 'number', example: 5 },
            roofAreaSqFt: { type: 'number', example: 500 },
            source: { type: 'string', enum: ['WEB', 'WHATSAPP', 'PHONE', 'WALK_IN', 'REFERRAL'], default: 'WEB' },
            consent: { type: 'boolean', default: true },
            honeypot: { type: 'string', description: 'Anti-bot honeypot field; must be empty' },
          },
          required: ['name', 'phone', 'address', 'pincode'],
        },
        CreateQuoteInput: {
          type: 'object',
          properties: {
            leadId: { type: 'string', format: 'uuid' },
            systemTemplateId: { type: 'string', format: 'uuid' },
            capacityKw: { type: 'number', example: 3.24 },
            systemType: { type: 'string', enum: ['ON_GRID', 'OFF_GRID', 'HYBRID'] },
            batteryKwh: { type: 'number', example: 0 },
            basePricePaise: { type: 'string', example: '32000000' },
            discountPaise: { type: 'string', example: '1000000' },
            notes: { type: 'string' },
          },
          required: ['leadId', 'capacityKw', 'systemType', 'basePricePaise'],
        },
        RecordPaymentInput: {
          type: 'object',
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            amountPaise: { type: 'string', example: '10000000' },
            mode: { type: 'string', enum: ['UPI', 'NEFT_RTGS', 'CHEQUE', 'CASH'] },
            refNumber: { type: 'string', example: 'UPI-20261031-1234' },
            notes: { type: 'string' },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
          required: ['orderId', 'amountPaise', 'mode'],
        },
        CreateTicketInput: {
          type: 'object',
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            installationId: { type: 'string', format: 'uuid' },
            unitId: { type: 'string', format: 'uuid' },
            category: { type: 'string', enum: ['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER'] },
            faultCode: { type: 'string', example: 'E031' },
            description: { type: 'string', example: 'Inverter flashing red status LED' },
            priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
            channel: { type: 'string', enum: ['PHONE', 'PORTAL', 'WHATSAPP', 'INTERNAL'], default: 'PHONE' },
          },
          required: ['customerId', 'category', 'description'],
        },
        ReplaceTicketPartInput: {
          type: 'object',
          properties: {
            removedUnitCode: { type: 'string', example: 'INV-2024-0012' },
            replacementUnitCode: { type: 'string', example: 'INV-2026-0999' },
            isChargeable: { type: 'boolean', default: false },
            unitPricePaise: { type: 'number', example: 0 },
          },
          required: ['removedUnitCode', 'replacementUnitCode'],
        },
        ResolveTicketInput: {
          type: 'object',
          properties: {
            resolutionNotes: { type: 'string', example: 'Replaced AC contactor and verified grid sync' },
            isChargeable: { type: 'boolean', default: false },
            laborCostPaise: { type: 'number', example: 0 },
            partsCostPaise: { type: 'number', example: 0 },
          },
          required: ['resolutionNotes'],
        },
        ConfirmTicketInput: {
          type: 'object',
          properties: {
            confirmationMethod: { type: 'string', enum: ['PORTAL', 'PHONE'], default: 'PORTAL' },
            customerFeedback: { type: 'string', example: 'Issue resolved promptly. System generating well.' },
          },
        },
        KpiSummaryOutput: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM'] },
            revenue: { $ref: '#/components/schemas/KpiTile' },
            collections: { $ref: '#/components/schemas/KpiTile' },
            expenses: { $ref: '#/components/schemas/KpiTile' },
            grossProfit: { $ref: '#/components/schemas/KpiTile' },
            margin: {
              type: 'object',
              properties: {
                marginBp: { type: 'number', example: 2150 },
                marginPercent: { type: 'string', example: '21.5%' },
              },
            },
          },
        },
        KpiTile: {
          type: 'object',
          properties: {
            valuePaise: { type: 'string', example: '35000000' },
            priorValuePaise: { type: 'string', example: '28000000' },
            deltaPaise: { type: 'string', example: '7000000' },
            percentChange: { type: 'number', example: 25.0 },
            isPositive: { type: 'boolean', example: true },
          },
        },
      },
    },
    paths: {
      '/public/enquiries': {
        post: {
          summary: 'Submit customer solar enquiry',
          tags: ['Public'],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateEnquiryInput' } } },
          },
          responses: {
            201: { description: 'Lead created successfully; returns confirmation and portal link' },
            400: { description: 'Validation failed or bot honeypot tripped' },
          },
        },
      },
      '/public/quotes/{token}': {
        get: {
          summary: 'View public customer quotation',
          tags: ['Public Quotes'],
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Quotation details and itemized pricing' },
            404: { description: 'Quote link not found or expired' },
          },
        },
      },
      '/public/quotes/{token}/accept': {
        post: {
          summary: 'Accept quotation with customer phone challenge verification',
          tags: ['Public Quotes'],
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { phoneDigits: { type: 'string', minLength: 4, maxLength: 4, example: '3210' } },
                  required: ['phoneDigits'],
                },
              },
            },
          },
          responses: {
            200: { description: 'Quote accepted; order transitioned to PENDING_ADVANCE' },
            403: { description: 'Phone challenge failed' },
          },
        },
      },
      '/portal/{token}/tickets': {
        get: {
          summary: 'List service tickets for customer portal',
          tags: ['Customer Portal'],
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'List of customer service tickets' } },
        },
        post: {
          summary: 'Raise new service ticket via customer portal',
          tags: ['Customer Portal'],
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    category: { type: 'string', enum: ['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER'] },
                    description: { type: 'string' },
                    priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
                  },
                  required: ['category', 'description'],
                },
              },
            },
          },
          responses: { 201: { description: 'Ticket created with SLA and warranty verdict' } },
        },
      },
      '/portal/{token}/tickets/{ticketId}/confirm': {
        post: {
          summary: 'Confirm resolution of ticket by customer',
          tags: ['Customer Portal'],
          parameters: [
            { name: 'token', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 200: { description: 'Resolution confirmed; ticket transitions to CLOSED' } },
        },
      },
      '/search': {
        get: {
          summary: 'Global unified entity search (Phone, Serial, Customer, Documents)',
          tags: ['Search'],
          security: [{ SessionCookie: [] }],
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 } }],
          responses: {
            200: { description: 'Multi-entity search matches with sub-300ms SLA' },
          },
        },
      },
      '/tickets': {
        get: {
          summary: 'List service desk tickets with filters',
          tags: ['Service Desk'],
          security: [{ SessionCookie: [] }],
          responses: { 200: { description: 'List of tickets' } },
        },
        post: {
          summary: 'Create service ticket',
          tags: ['Service Desk'],
          security: [{ SessionCookie: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTicketInput' } } },
          },
          responses: { 201: { description: 'Ticket created' } },
        },
      },
      '/tickets/{id}/parts/replace': {
        post: {
          summary: 'Scan and replace physical unit under ticket with warranty transfer chain',
          tags: ['Service Desk'],
          security: [{ SessionCookie: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ReplaceTicketPartInput' } } },
          },
          responses: { 200: { description: 'RMA replacement recorded with successor warranty' } },
        },
      },
      '/tickets/{id}/resolve': {
        post: {
          summary: 'Resolve ticket with resolution notes and chargeable billing calculation',
          tags: ['Service Desk'],
          security: [{ SessionCookie: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ResolveTicketInput' } } },
          },
          responses: { 200: { description: 'Ticket marked RESOLVED' } },
        },
      },
      '/analytics/kpis': {
        get: {
          summary: 'Director KPI metrics with IST period boundaries and comparison deltas',
          tags: ['Analytics'],
          security: [{ SessionCookie: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM'] } },
            { name: 'customStart', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'customEnd', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/KpiSummaryOutput' } } } },
            403: { description: 'Forbidden for non-director / non-accounts roles' },
          },
        },
      },
      '/analytics/profitability': {
        get: {
          summary: 'Project profitability matrix matching v_project_profitability down to the paisa',
          tags: ['Analytics'],
          security: [{ SessionCookie: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string' } },
            { name: 'isLossOnly', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { 200: { description: 'Project profitability list' } },
        },
      },
      '/analytics/share': {
        post: {
          summary: 'Generate expiring read-only dashboard share link token',
          tags: ['Analytics'],
          security: [{ SessionCookie: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    period: { type: 'string', enum: ['TODAY', 'THIS_WEEK', 'THIS_MONTH'], default: 'THIS_MONTH' },
                    durationHours: { type: 'number', default: 24, maximum: 168 },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Share link created' } },
        },
      },
      '/analytics/share/{token}': {
        get: {
          summary: 'View shared read-only director dashboard by token',
          tags: ['Analytics'],
          parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Read-only dashboard metrics snapshot' },
            410: { description: 'Share link has expired' },
            403: { description: 'Invalid token signature' },
          },
        },
      },
      '/cron/maintenance': {
        post: {
          summary: 'Trigger daily predictive maintenance rules and customer warranty reminders',
          tags: ['Cron'],
          security: [{ CronSecret: [] }],
          responses: {
            200: { description: 'Evaluated installations, created alerts, queued reminders' },
          },
        },
      },
      '/cron/outbox': {
        post: {
          summary: 'Process pending SMS/Email outbox queue with exponential backoff retry',
          tags: ['Cron'],
          security: [{ CronSecret: [] }],
          responses: { 200: { description: 'Batch delivery result' } },
        },
      },
    },
  };
}

