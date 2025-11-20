from huggingface_hub import snapshot_download

def main():
    print("Downloading English model...")
    snapshot_download(
        "hearmyheart/hmh-whisper-en-small-v3-ct2",
        local_dir="ct2/en",
        repo_type="model",
        local_dir_use_symlinks=False,
    )

    print("Downloading Tagalog model...")
    snapshot_download(
        "hearmyheart/hmh-whisper-tl-small-v3-ct2",
        local_dir="ct2/tl",
        repo_type="model",
        local_dir_use_symlinks=False,
    )

    print("Models downloaded successfully to ct2/en and ct2/tl")

if __name__ == "__main__":
    main()
