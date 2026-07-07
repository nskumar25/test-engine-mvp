window.ASSESSMENT_ENV = "live"; // "live" or "local"

const environments = {
  live: {
    dataProvider: "api",
    apiBaseUrl: "https://assessment-test-engine-api.onrender.com"
  },

  local: {
    dataProvider: "api",
    apiBaseUrl: "http://127.0.0.1:5173"
  }
};

const active =
  environments[window.ASSESSMENT_ENV] ||
  environments.live;

window.ASSESSMENT_DATA_PROVIDER =
  active.dataProvider;

window.ASSESSMENT_API_BASE_URL =
  active.apiBaseUrl;