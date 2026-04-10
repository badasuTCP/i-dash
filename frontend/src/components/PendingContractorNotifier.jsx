/**
 * PendingContractorNotifier
 *
 * Mounted inside the authenticated layout.  On first render it checks
 * whether there are contractors discovered by the Meta pipeline that
 * still need Super Admin approval.  If so, a persistent toast is shown
 * with a direct link to the Contractor Management page.
 *
 * Only fires for users with the 'data-analyst' (Super Admin) role.
 */

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { contractorsAPI } from '../services/api';

const PendingContractorNotifier = () => {
  const { user, isAuthenticated, authMode } = useAuth();
  const hasFired = useRef(false);

  useEffect(() => {
    // Only fire ONCE per browser session, only for admin/data-analyst
    if (hasFired.current) return;
    if (!isAuthenticated) return;
    if (authMode === 'demo') return;
    if (user?.role !== 'data-analyst' && user?.role !== 'admin') return;
    if (sessionStorage.getItem('idash_pending_notified')) return;

    hasFired.current = true;
    sessionStorage.setItem('idash_pending_notified', '1');

    const check = async () => {
      try {
        const { data } = await contractorsAPI.getPendingCount();
        const count = data?.count ?? 0;

        if (count > 0) {
          toast(
            (t) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong>
                  {count} new contractor{count > 1 ? 's' : ''} discovered
                </strong>
                <span style={{ fontSize: '0.85em', opacity: 0.85 }}>
                  The Meta pipeline found {count === 1 ? 'a new ad account' : `${count} new ad accounts`} not yet in your dashboard.
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <a
                    href="/data/pipelines"
                    style={{
                      color: '#265AA9',
                      fontWeight: 600,
                      textDecoration: 'underline',
                      fontSize: '0.85em',
                    }}
                    onClick={() => toast.dismiss(t.id)}
                  >
                    Review &rarr;
                  </a>
                  <button
                    onClick={() => toast.dismiss(t.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: '0.85em',
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ),
            {
              duration: 15000,
              position: 'top-right',
              icon: '🔔',
              style: {
                minWidth: 300,
                padding: '14px 18px',
              },
            }
          );
        }
      } catch {
        // Silently ignore — backend may not have the endpoint yet
      }
    };

    check();
  }, [isAuthenticated, authMode, user]);

  return null; // Render nothing — this is a side-effect-only component
};

export default PendingContractorNotifier;
