// First-run orientation: a one-time callout on the options page explaining how the
// extension is used, plus a grant button when host access is missing. Completion is
// persisted through the storage helpers.

/**
 * @param {boolean} granted
 */
function updateHostAccess(granted) {
  elements.onboardingGrant.hidden = granted;
}

function bindOnboarding() {
  elements.onboardingDismiss.addEventListener('click', async () => {
    await saveOnboardingComplete();
    elements.onboarding.hidden = true;
  });
  elements.onboardingGrant.addEventListener('click', async () => {
    if (!(await requestHostAccess())) return;
    updateHostAccess(true);
    try {
      await refreshEngineIcons();
    } catch {
      // Leave the letter fallbacks in place until the user retries.
    }
  });
}

/**
 * @returns {Promise<void>}
 */
async function revealOnboarding() {
  if (await loadOnboardingComplete()) return;
  elements.onboarding.hidden = false;
  if (typeof api.permissions?.request !== 'function') {
    elements.onboardingGrant.hidden = true;
    return;
  }
  const granted = await api.permissions.contains?.({ origins: HOST_ORIGINS });
  updateHostAccess(Boolean(granted));
}
