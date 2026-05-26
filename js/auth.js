console.log("auth.js carregado");

let currentEmployee = null;
let loginInProgress = false;

const AUTHORIZED_CPFS_LOCAL = {
  "12873843748": {
    id: "cpf-12873843748",
    name: "Funcionário Teste 1",
    store_sector: "Teste Rezende"
  },
  "05820212789": {
    id: "cpf-05820212789",
    name: "Funcionário Teste 2",
    store_sector: "Teste Rezende"
  }
};

function formatCPF(cpf) {
  let value = String(cpf || "").replace(/\D/g, "");

  if (value.length > 11) {
    value = value.slice(0, 11);
  }

  if (value.length <= 3) {
    return value;
  }

  if (value.length <= 6) {
    return value.replace(/(\d{3})(\d+)/, "$1.$2");
  }

  if (value.length <= 9) {
    return value.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  }

  return value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

function cleanCPF(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function loadSavedEmployee() {
  const saved = localStorage.getItem("bolao_rezende_employee");

  if (!saved) {
    return null;
  }

  try {
    currentEmployee = JSON.parse(saved);
    return currentEmployee;
  } catch (error) {
    console.error("Erro ao carregar sessão:", error);
    localStorage.removeItem("bolao_rezende_employee");
    return null;
  }
}

function saveEmployeeSession(employee, cpfClean) {
  currentEmployee = {
    id: employee.id,
    name: employee.name,
    store_sector: employee.store_sector,
    cpf: cpfClean
  };

  localStorage.setItem("bolao_rezende_employee", JSON.stringify(currentEmployee));

  return currentEmployee;
}

function validateCPFLocal(cpfClean) {
  const employee = AUTHORIZED_CPFS_LOCAL[cpfClean];

  if (!employee) {
    throw new Error("CPF não habilitado para participar do Bolão Rezende.");
  }

  return saveEmployeeSession(employee, cpfClean);
}

function withTimeout(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Tempo esgotado ao validar no Supabase."));
      }, timeoutMs);
    })
  ]);
}

async function loginWithCPF(cpf) {
  const cpfClean = cleanCPF(cpf);

  console.log("CPF limpo:", cpfClean);

  if (cpfClean.length !== 11) {
    throw new Error("CPF deve conter 11 dígitos.");
  }

  try {
    const client = getSupabaseClient();

    console.log("Cliente Supabase obtido:", client);
    console.log("Método rpc disponível?", typeof client.rpc);

    const { data, error } = await withTimeout(
      client.rpc("check_employee_cpf", {
        cpf_input: cpfClean
      }),
      5000
    );

    console.log("Resposta Supabase:", data, error);

    if (error) {
      console.warn("Falha na validação pelo Supabase. Tentando lista local.", error);
      return validateCPFLocal(cpfClean);
    }

    if (data && data.length > 0) {
      return saveEmployeeSession(data[0], cpfClean);
    }

    return validateCPFLocal(cpfClean);
  } catch (error) {
    console.warn("Supabase demorou/falhou. Tentando lista local.", error);
    return validateCPFLocal(cpfClean);
  }
}

function showAuthForm() {
  const authContainer = document.querySelector("#auth-container");
  const appContent = document.querySelector("#app-content");

  if (authContainer) {
    authContainer.hidden = false;
    authContainer.style.display = "";
  }

  if (appContent) {
    appContent.hidden = true;
    appContent.style.display = "none";
  }
}

function showAppContent() {
  const authContainer = document.querySelector("#auth-container");
  const appContent = document.querySelector("#app-content");
  const logoutButton = document.querySelector("#logout-button");

  if (authContainer) {
    authContainer.hidden = true;
    authContainer.style.display = "none";
  }

  if (appContent) {
    appContent.hidden = false;
    appContent.style.display = "";
  }

  if (logoutButton) {
    logoutButton.hidden = false;
    logoutButton.style.display = "";
  }
}

function showAuthMessage(message, isError = false) {
  const messageDiv = document.querySelector("#auth-message");

  if (!messageDiv) {
    alert(message);
    return;
  }

  messageDiv.textContent = message;
  messageDiv.className = `auth-message ${isError ? "error" : "success"}`;
  messageDiv.hidden = false;
  messageDiv.style.display = "block";

  setTimeout(() => {
    messageDiv.hidden = true;
    messageDiv.style.display = "none";
  }, 5000);
}

function showToastSafe(message) {
  const toast = document.querySelector("#toast");

  if (toast) {
    toast.textContent = message;
    toast.hidden = false;
    toast.style.display = "block";

    setTimeout(() => {
      toast.hidden = true;
      toast.style.display = "none";
    }, 3600);
  } else {
    console.warn(message);
  }
}

async function handleCPFLogin(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (loginInProgress) {
    console.log("Login já em andamento. Ignorando clique duplicado.");
    return false;
  }

  loginInProgress = true;

  console.log("submit capturado");

  const cpfInput = document.querySelector("#cpf-input");
  const button = document.querySelector("#login-button");

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }

    const cpf = cpfInput ? cpfInput.value : "";

    await loginWithCPF(cpf);

    console.log("Login autorizado:", currentEmployee);

    showAppContent();

    if (button) {
      button.disabled = false;
      button.textContent = "Entrar";
    }

    loginInProgress = false;

    if (typeof initApp === "function") {
      initApp()
        .then(() => {
          console.log("App carregado após login.");
        })
        .catch((appError) => {
          console.error("Erro ao iniciar app após login:", appError);
          showToastSafe("Login feito, mas houve erro ao carregar o bolão.");
        });
    } else {
      console.warn("initApp não encontrada. Login foi liberado, mas o app não iniciou.");
      showToastSafe("Login feito, mas o sistema não encontrou initApp().");
    }
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    showAuthMessage(error.message || "Erro ao fazer login.", true);

    if (button) {
      button.disabled = false;
      button.textContent = "Entrar";
    }

    loginInProgress = false;
  }

  return false;
}

async function logout() {
  currentEmployee = null;
  localStorage.removeItem("bolao_rezende_employee");
  return true;
}

function getCurrentEmployee() {
  return currentEmployee;
}

function setupAuthListeners() {
  const cpfInput = document.querySelector("#cpf-input");
  const cpfForm = document.querySelector("#cpf-form");
  const loginButton = document.querySelector("#login-button");
  const logoutButton = document.querySelector("#logout-button");

  if (cpfInput) {
    cpfInput.addEventListener("input", (event) => {
      event.target.value = formatCPF(event.target.value);
    });
  }

  if (cpfForm) {
    cpfForm.onsubmit = handleCPFLogin;
  }

  if (loginButton) {
    loginButton.type = "submit";
  }

  if (logoutButton) {
    logoutButton.onclick = async () => {
      try {
        await logout();
        location.reload();
      } catch (error) {
        console.error("Erro ao sair:", error);
        showAuthMessage("Erro ao sair.", true);
      }
    };
  }
}

async function initAuth() {
  setupAuthListeners();

  const employee = loadSavedEmployee();

  if (employee) {
    console.log("Sessão salva encontrada:", employee);
    showAppContent();

    if (typeof initApp === "function") {
      initApp()
        .then(() => {
          console.log("App carregado com sessão salva.");
        })
        .catch((error) => {
          console.error("Erro ao carregar app com sessão salva:", error);
          showToastSafe("Sessão carregada, mas houve erro ao carregar o bolão.");
        });
    }
  } else {
    showAuthForm();
  }
}

document.addEventListener("DOMContentLoaded", initAuth);