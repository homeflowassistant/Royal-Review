import express, { Request, Response } from 'express';
import axios from 'axios';
import { getInstallation } from '../ghl-service';

const router = express.Router();

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

// Token storage (in production, use database)
interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  companyId: string;
}

const tokenStore = new Map<string, StoredToken>();

// Helper: Get valid agency token (refresh if needed)
async function getValidAgencyToken(): Promise<string> {
  const agencyPrivateToken = process.env.GHL_AGENCY_PRIVATE_TOKEN;
  if (!agencyPrivateToken) {
    throw new Error('GHL_AGENCY_PRIVATE_TOKEN not configured');
  }
  return agencyPrivateToken;
}

async function resolveCompanyId(locationId: string): Promise<string> {
  const envCompanyId = process.env.GHL_COMPANY_ID?.trim();
  if (envCompanyId) {
    return envCompanyId;
  }

  const installation = await getInstallation(locationId);
  const storedCompanyId = installation?.companyId?.trim();
  if (storedCompanyId) {
    return storedCompanyId;
  }

  throw new Error('Unable to resolve company ID for this location. Reinstall the app or set GHL_COMPANY_ID.');
}

// Helper: Make GHL API call
async function ghlRequest({
  method = 'GET',
  path,
  token,
  data,
  params,
}: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  token: string;
  data?: any;
  params?: Record<string, any>;
}) {
  const response = await axios({
    method,
    url: `${GHL_BASE}${path}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    data,
    params,
  });
  return response.data;
}

/**
 * GET /api/auth/location-token?locationId=...
 * Exchange agency token for location-scoped token
 */
router.get('/auth/location-token', async (req: Request, res: Response) => {
  try {
    const { locationId } = req.query;

    if (!locationId || typeof locationId !== 'string') {
      return res.status(400).json({ error: 'locationId query parameter is required' });
    }

    const companyId = await resolveCompanyId(locationId);

    const agencyToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'POST',
      path: '/oauth/locationToken',
      token: agencyToken,
      data: {
        companyId,
        locationId,
      },
    });

    res.json({
      access_token: result.access_token,
      expires_in: result.expires_in,
    });
  } catch (error: any) {
    console.error('Location token error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to get location token',
    });
  }
});

/**
 * GET /api/saas/plan?locationId=...
 * Get current SaaS plan details (Agency Private Token)
 */
router.get('/saas/plan', async (req: Request, res: Response) => {
  try {
    const { locationId } = req.query;

    if (!locationId || typeof locationId !== 'string') {
      return res.status(400).json({ error: 'locationId query parameter is required' });
    }

    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'GET',
      path: `/saas-api/public-api/locations/${locationId}`,
      token: agencyPrivateToken,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Plan fetch error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch plan',
    });
  }
});

/**
 * GET /api/saas/plans
 * List available plans (Agency Private Token)
 */
router.get('/saas/plans', async (req: Request, res: Response) => {
  try {
    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'GET',
      path: '/saas-api/public-api/plans',
      token: agencyPrivateToken,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Plans fetch error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to fetch plans',
    });
  }
});

/**
 * PUT /api/saas/update-subscription
 * Update plan or Stripe details (Agency OAuth Token via proxy)
 */
router.put('/saas/update-subscription', async (req: Request, res: Response) => {
  try {
    const { locationId, planId, customerId, subscriptionId } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const companyId = await resolveCompanyId(locationId);

    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'PUT',
      path: `/update-saas-subscription/${locationId}`,
      token: agencyPrivateToken,
      data: {
        customerId,
        subscriptionId,
        planId,
        locationId,
        companyId,
      },
    });

    res.json(result);
  } catch (error: any) {
    console.error('Update subscription error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to update subscription',
    });
  }
});

/**
 * POST /api/saas/pause
 * Pause or resume account (Agency Private Token)
 */
router.post('/saas/pause', async (req: Request, res: Response) => {
  try {
    const { locationId, pause } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'POST',
      path: '/saas-api/public-api/pause-location',
      token: agencyPrivateToken,
      data: {
        locationId,
        pause: pause ?? true,
      },
    });

    res.json(result);
  } catch (error: any) {
    console.error('Pause account error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to pause account',
    });
  }
});

/**
 * POST /api/saas/disable
 * Disable/cancel SaaS subscription (Agency Private Token)
 */
router.post('/saas/disable', async (req: Request, res: Response) => {
  try {
    const { locationId } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'POST',
      path: '/saas-api/public-api/disable-saas',
      token: agencyPrivateToken,
      data: {
        locationId,
      },
    });

    res.json(result);
  } catch (error: any) {
    console.error('Disable SaaS error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to disable SaaS',
    });
  }
});

/**
 * DELETE /api/location/delete
 * Delete location (Agency OAuth Token)
 */
router.delete('/location/delete', async (req: Request, res: Response) => {
  try {
    const { locationId, confirmationText } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    if (confirmationText !== 'DELETE') {
      return res.status(400).json({ error: 'Invalid confirmation text' });
    }

    const agencyPrivateToken = await getValidAgencyToken();

    const result = await ghlRequest({
      method: 'DELETE',
      path: `/locations/${locationId}`,
      token: agencyPrivateToken,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Delete location error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Failed to delete location',
    });
  }
});

export default router;
