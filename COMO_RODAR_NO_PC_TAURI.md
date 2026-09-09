# Guia Completo: Como rodar o MIDI-Cam no PC como App Nativo (Tauri + VS Code)

Este guia ensina como rodar e empacotar o **midi-cam** como um aplicativo nativo (`.exe` no Windows ou `.dmg` no Mac) usando **Tauri** e **VS Code**.

---

## 🚀 Opção Rápida: Usar sem instalar nada (Navegador / PWA)
Se você ou outra pessoa quiser usar imediatamente no PC:
1. Abra o link do app no **Google Chrome**, **Microsoft Edge** ou **Brave** no PC.
2. O navegador já reconhece todos os teclados MIDI conectados via USB.
3. Clique no ícone de instalar na barra de endereços (ou no botão "Instalar no PC").
4. O app abre em janela própria como um aplicativo!

---

## 🛠️ Opção Nativa: Compilar com Tauri + VS Code

### Passo 1: Instalar os pré-requisitos no computador (Apenas 1 vez)

1. **Node.js**: Baixe e instale a versão LTS em [nodejs.org](https://nodejs.org).
2. **Rust (Linguagem do Tauri)**:
   - No **Windows**: Baixe e execute `rustup-init.exe` em [rustup.rs](https://rustup.rs). Escolha a opção padrão (1).
   - No **Mac/Linux**: Abra o terminal e rode:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
3. **C++ Build Tools (Apenas no Windows)**:
   - Instale o instalador do Visual Studio (Community) e marque a opção **"Desenvolvimento para Desktop com C++"** (necessário para compilar programas em C/Rust no Windows).

---

### Passo 2: Abrir o projeto no VS Code

1. Abra a pasta do projeto no **VS Code**.
2. Abra o terminal integrado do VS Code (`Ctrl + '` ou menu **Terminal > Novo Terminal**).
3. Instale as dependências do projeto caso ainda não tenha feito:
   ```bash
   npm install
   ```

---

### Passo 3: Testar o App Nativo em Modo de Desenvolvimento

No terminal do VS Code, execute:

```bash
npx tauri dev
```

> **O que acontece?**
> O Tauri iniciará o servidor Vite (`http://localhost:3000`) e abrirá imediatamente uma janela nativa do Windows chamada **midi-cam**.
> Qualquer alteração que você fizer no código no VS Code atualizará automaticamente a tela!

---

### Passo 4: Gerar o Instalador Executável (.exe / .msi)

Para gerar o instalador definitivo de produção para enviar ou instalar no seu PC:

```bash
npx tauri build
```

Quando o comando terminar, o instalador pronto estará na pasta:
- **No Windows**: `src-tauri/target/release/bundle/msi/midi-cam_1.0.0_x64_en-US.msi` (ou pasta `bundle/nsis/`)
- **No Mac**: `src-tauri/target/release/bundle/dmg/midi-cam_1.0.0_x64.dmg`

O aplicativo gerado tem menos de **10 MB**, consome pouquíssima memória RAM e abre instantaneamente!

---

## 🎹 Como Usar a Sincronização Wi-Fi entre o PC e o Celular

1. **No Computador (midi-cam aberto)**:
   - Conecte seu teclado MIDI na porta USB do PC (ou abra sua DAW como Ableton/FL Studio/Reaper).
   - Clique no botão **"Wi-Fi PC"** na barra superior e escolha a aba **"Transmissor (PC)"**.
   - Clique em **"Iniciar Transmissor Wi-Fi no PC"**.
   - O app exibirá um **Código de 6 dígitos** e um **QR Code**.

2. **No Celular / Tablet**:
   - Abra o MIDI-Cam no celular (no mesmo Wi-Fi).
   - Aponte a câmera do celular para o QR Code da tela do PC (ou digite o código de 6 dígitos).
   - **Pronto!** O celular conecta diretamente com o computador (latência de 2 a 5ms).
   - Tudo o que você tocar no teclado do computador acenderá o teclado virtual do celular e sairá no vídeo gravado!
