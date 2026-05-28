# Setting Up Local AI Providers

To get the most out of {{COMPANY}} AI Training, you need a local model running on your machine.

## Option 1: Ollama (Recommended)

Ollama is the simplest way to get up and running on macOS, Linux, and Windows.

1.  **Download:** Visit [ollama.com](https://ollama.com/) and install the app.
2.  **Pull Models:** Open your terminal and run:
    ```bash
    ollama pull llama3
    ollama pull mistral
    ollama pull phi3
    ```
3.  **Run:** The app will stay in your menu bar. 
4.  **Security Note:** Ollama's default configuration only allows connections from `127.0.0.1`. This application connects to it via your browser.

## Option 2: LM Studio

LM Studio provides a GUI for searching and downloading specific models from Hugging Face.

1.  **Download:** Visit [lmstudio.ai](https://lmstudio.ai/).
2.  **Download a Model:** Search for "Llama 3" or "Gemma".
3.  **Start Server:** 
    - Go to the **Local Server** tab (↔️ icon).
    - Ensure "CORS" is enabled.
    - Click **Start Server**.
    - The server will run on `http://localhost:12345`.

## Troubleshooting

-   **"No Models Found":** Ensure your provider is running. If using Ollama, try running `ollama list` in your terminal.
-   **CORS Errors:** In LM Studio, ensure the CORS toggle is ON. For Ollama, the default settings usually work if the app is serving the dashboard from the same host.
-   **Performance:** Older hardware might struggle with 7B+ parameters. Try using **Phi-3** or **Gemma 2B** for faster responses on base-model laptops.
