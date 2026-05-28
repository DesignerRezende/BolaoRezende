console.log("auth.js carregado");

let currentEmployee = null;
let loginInProgress = false;

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

function saveEmployeeSession(employee) {
  currentEmployee = {
    id: employee.id,
    name: employee.name,
    store_sector: employee.store_sector,
    cpf: employee.cpf_digits,
    cpf_digits: employee.cpf_digits,
    active: employee.active,
    must_change_password: employee.must_change_password
  };

  localStorage.setItem("bolao_rezende_employee", JSON.stringify(currentEmployee));

  return currentEmployee;
}

function updateEmployeeSession(updates = {}) {
  if (!currentEmployee) return null;

  currentEmployee = {
    ...currentEmployee,
    ...updates
  };

  localStorage.setItem("bolao_rezende_employee", JSON.stringify(currentEmployee));

  return currentEmployee;
}

function withTimeout(promise, timeoutMs = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Tempo esgotado ao validar no Supabase."));
      }, timeoutMs);
    })
  ]);
}

async function loginWithCPFAndPassword(cpf, password) {
  const cpfClean = cleanCPF(cpf);
  const passwordClean = String(password || "").trim();

  console.log("CPF limpo:", cpfClean);

  if (cpfClean.length !== 11) {
    throw new Error("CPF deve conter 11 dígitos.");
  }

  if (!passwordClean) {
    throw new Error("Digite sua senha.");
  }

  const client = getSupabaseClient();

  const { data, error } = await withTimeout(
    client.rpc("login_authorized_employee", {
      p_cpf_digits: cpfClean,
      p_password: passwordClean
    }),
    8000
  );

  console.log("Resposta login Supabase:", data, error);

  if (error) {
    console.error("Erro RPC login_authorized_employee:", error);
    throw new Error("Erro ao validar login no Supabase.");
  }

  if (!data || data.length === 0) {
    throw new Error("CPF ou senha inválidos.");
  }

  return saveEmployeeSession(data[0]);
}

async function changeCurrentEmployeePassword(oldPassword, newPassword, confirmPassword) {
  if (!currentEmployee?.id) {
    throw new Error("Sessão não encontrada. Faça login novamente.");
  }

  const oldPasswordClean = String(oldPassword || "").trim();
  const newPasswordClean = String(newPassword || "").trim();
  const confirmPasswordClean = String(confirmPassword || "").trim();

  if (!oldPasswordClean) {
    throw new Error("Digite sua senha atual.");
  }

  if (!/^[0-9]{6}$/.test(newPasswordClean)) {
    throw new Error("A nova senha deve ter exatamente 6 números.");
  }

  if (newPasswordClean !== confirmPasswordClean) {
    throw new Error("A confirmação da senha não confere.");
  }

  if (oldPasswordClean === newPasswordClean) {
    throw new Error("A nova senha precisa ser diferente da senha atual.");
  }

  const client = getSupabaseClient();

  const { data, error } = await withTimeout(
    client.rpc("change_authorized_employee_password", {
      p_employee_id: currentEmployee.id,
      p_old_password: oldPasswordClean,
      p_new_password: newPasswordClean
    }),
    8000
  );

  console.log("Resposta alteração de senha:", data, error);

  if (error) {
    console.error("Erro RPC change_authorized_employee_password:", error);
    throw new Error("Erro ao alterar senha no Supabase.");
  }

  if (!data?.ok) {
    throw new Error(data?.error || "Não foi possível alterar a senha.");
  }

  updateEmployeeSession({
    must_change_password: false
  });

  return data;
}

function ensurePasswordField() {
  const cpfForm = document.querySelector("#cpf-form");
  const cpfInput = document.querySelector("#cpf-input");
  const loginButton = document.querySelector("#login-button");

  if (!cpfForm || !cpfInput) return;

  let passwordInput = document.querySelector("#password-input");

  if (!passwordInput) {
    const passwordGroup = document.createElement("div");
    passwordGroup.className = "auth-field auth-password-field";
    passwordGroup.innerHTML = `
      <label for="password-input">Senha</label>
      <input
        id="password-input"
        name="password"
        type="password"
        inputmode="numeric"
        autocomplete="current-password"
        placeholder="Digite sua senha"
        required
      >
      <small>Primeiro acesso: use a senha 1234.</small>
    `;

    if (loginButton) {
      loginButton.insertAdjacentElement("beforebegin", passwordGroup);
    } else {
      cpfForm.appendChild(passwordGroup);
    }
  }
}

function ensurePasswordChangeButton() {
  const logoutButton = document.querySelector("#logout-button");

  if (document.querySelector("#change-password-button")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "change-password-button";
  button.type = "button";
  button.className = "logout-button change-password-button";
  button.textContent = "Alterar senha";
  button.hidden = true;
  button.style.display = "none";

  button.addEventListener("click", openPasswordWindow);

  if (logoutButton && logoutButton.parentElement) {
    logoutButton.insertAdjacentElement("beforebegin", button);
  } else {
    document.body.appendChild(button);
  }
}

function openPasswordWindow() {
  if (!currentEmployee?.id) {
    showToastSafe("Faça login novamente para alterar a senha.");
    return;
  }

  window.__bolaoChangePassword = changeCurrentEmployeePassword;
  window.__bolaoShowToast = showToastSafe;

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const popup = window.open(
    "",
    "alterarSenhaBolaoRezende",
    isMobile ? "" : "width=480,height=640,resizable=yes,scrollbars=yes"
  );

  if (!popup) {
    showToastSafe("O navegador bloqueou a janela. Libere pop-ups para alterar a senha.");
    return;
  }

  popup.document.open();
  popup.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <title>Alterar senha - Torcida Rezende</title>

        <style>
          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: 100%;
            min-height: 100%;
            overflow-x: hidden;
          }

          body {
            margin: 0;
            min-height: 100vh;
            min-height: 100dvh;
            font-family: Arial, sans-serif;
            background:
              radial-gradient(circle at top left, rgba(0, 176, 80, 0.24), transparent 35%),
              linear-gradient(135deg, #020817 0%, #08142d 62%, #111400 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }

          .card {
            width: 100%;
            max-width: 420px;
            background: #0b1630;
            border: 1px solid rgba(0, 176, 80, 0.65);
            border-top: 4px solid #ffdd00;
            border-radius: 24px;
            padding: 28px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
          }

          .eyebrow {
            display: inline-block;
            color: #ffdd00;
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 6px;
          }

          h1 {
            margin: 0 0 8px;
            font-size: 34px;
            line-height: 1;
          }

          p {
            margin: 0 0 24px;
            color: #b7c1d6;
            font-size: 14px;
            line-height: 1.4;
          }

          label {
            display: block;
            margin-bottom: 16px;
            color: #ffdd00;
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
          }

          input {
            width: 100%;
            margin-top: 8px;
            padding: 16px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: #101a33;
            color: #ffffff;
            font-size: 16px;
            outline: none;
          }

          input:focus {
            border-color: #00b050;
            box-shadow: 0 0 0 3px rgba(0, 176, 80, 0.2);
          }

          .message {
            display: none;
            margin: 12px 0 16px;
            padding: 12px 14px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 700;
          }

          .message.success {
            display: block;
            background: rgba(0, 176, 80, 0.15);
            border: 1px solid rgba(0, 176, 80, 0.5);
            color: #87ffb5;
          }

          .message.error {
            display: block;
            background: rgba(255, 80, 80, 0.14);
            border: 1px solid rgba(255, 80, 80, 0.55);
            color: #ff9f9f;
          }

          .actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 8px;
          }

          button {
            width: 100%;
            border: 0;
            border-radius: 16px;
            padding: 15px 18px;
            font-weight: 900;
            cursor: pointer;
            text-transform: uppercase;
            font-size: 14px;
          }

          .save {
            background: linear-gradient(135deg, #ffdd00, #ff8a00);
            color: #061020;
            box-shadow: 0 12px 28px rgba(255, 178, 0, 0.28);
          }

          .cancel {
            background: #18243f;
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.14);
          }

          button:disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          @media (max-width: 768px) {
            body {
              align-items: flex-start;
              justify-content: center;
              padding: 18px;
              min-height: 100dvh;
            }

            .card {
              width: 100%;
              max-width: none;
              margin: 0 auto;
              padding: 22px;
              border-radius: 22px;
            }

            h1 {
              font-size: 30px;
            }

            input {
              font-size: 16px;
              padding: 15px;
            }
          }
        </style>
      </head>

      <body>
        <main class="card">
          <span class="eyebrow">Torcida Rezende</span>
          <h1>Alterar senha</h1>
          <p>A nova senha deve ter exatamente 6 números. No próximo login, use CPF + nova senha.</p>

          <form id="password-form">
            <label>
              Senha atual
              <input id="old-password" type="password" inputmode="numeric" placeholder="Senha atual" required>
            </label>

            <label>
              Nova senha
              <input id="new-password" type="password" inputmode="numeric" maxlength="6" placeholder="6 números" required>
            </label>

            <label>
              Confirmar nova senha
              <input id="confirm-password" type="password" inputmode="numeric" maxlength="6" placeholder="Repita a nova senha" required>
            </label>

            <div id="message" class="message"></div>

            <div class="actions">
              <button class="save" id="save-button" type="submit">Salvar senha</button>
              <button class="cancel" type="button" onclick="window.close()">Cancelar</button>
            </div>
          </form>
        </main>

        <script>
          const form = document.querySelector("#password-form");
          const oldInput = document.querySelector("#old-password");
          const newInput = document.querySelector("#new-password");
          const confirmInput = document.querySelector("#confirm-password");
          const message = document.querySelector("#message");
          const saveButton = document.querySelector("#save-button");

          function onlyNumbers(input) {
            input.value = String(input.value || "").replace(/\\\\D/g, "").slice(0, 6);
          }

          newInput.addEventListener("input", () => onlyNumbers(newInput));
          confirmInput.addEventListener("input", () => onlyNumbers(confirmInput));

          function showMessage(text, type) {
            message.textContent = text;
            message.className = "message " + type;
          }

          form.addEventListener("submit", async (event) => {
            event.preventDefault();

            try {
              saveButton.disabled = true;
              saveButton.textContent = "Salvando...";

              if (!window.opener || !window.opener.__bolaoChangePassword) {
                throw new Error("Não foi possível conectar com a tela principal.");
              }

              await window.opener.__bolaoChangePassword(
                oldInput.value,
                newInput.value,
                confirmInput.value
              );

              showMessage("Senha alterada com sucesso.", "success");

              if (window.opener.__bolaoShowToast) {
                window.opener.__bolaoShowToast("Senha alterada com sucesso.");
              }

              setTimeout(() => {
                window.close();
              }, 1200);
            } catch (error) {
              showMessage(error.message || "Erro ao alterar senha.", "error");
            } finally {
              saveButton.disabled = false;
              saveButton.textContent = "Salvar senha";
            }
          });
        <\/script>
      </body>
    </html>
  `);
  popup.document.close();
}

function showAuthForm() {
  const authContainer = document.querySelector("#auth-container");
  const appContent = document.querySelector("#app-content");
  const logoutButton = document.querySelector("#logout-button");
  const changePasswordButton = document.querySelector("#change-password-button");

  if (authContainer) {
    authContainer.hidden = false;
    authContainer.style.display = "";
  }

  if (appContent) {
    appContent.hidden = true;
    appContent.style.display = "none";
  }

  if (logoutButton) {
    logoutButton.hidden = true;
    logoutButton.style.display = "none";
  }

  if (changePasswordButton) {
    changePasswordButton.hidden = true;
    changePasswordButton.style.display = "none";
  }

  ensurePasswordField();
}

function showAppContent() {
  const authContainer = document.querySelector("#auth-container");
  const appContent = document.querySelector("#app-content");
  const logoutButton = document.querySelector("#logout-button");
  const changePasswordButton = document.querySelector("#change-password-button");

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

  if (changePasswordButton) {
    changePasswordButton.hidden = false;
    changePasswordButton.style.display = "";
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
  const passwordInput = document.querySelector("#password-input");
  const button = document.querySelector("#login-button");

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }

    const cpf = cpfInput ? cpfInput.value : "";
    const password = passwordInput ? passwordInput.value : "";

    await loginWithCPFAndPassword(cpf, password);

    console.log("Login autorizado:", currentEmployee);

    showAppContent();

    if (button) {
      button.disabled = false;
      button.textContent = "Entrar";
    }

    loginInProgress = false;

    if (currentEmployee?.must_change_password) {
      showToastSafe("Primeiro acesso identificado. Altere sua senha quando quiser.");
    }

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
  ensurePasswordField();
  ensurePasswordChangeButton();

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