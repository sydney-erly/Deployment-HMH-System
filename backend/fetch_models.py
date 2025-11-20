from huggingface_hub import snapshot_download

# English CT2 model
snapshot_download(
    "hearmyheart/hmh-whisper-en-small-v3-ct2",
    local_dir="ct2/en",
    repo_type="model"
)

# Tagalog CT2 model
snapshot_download(
    "hearmyheart/hmh-whisper-tl-small-v3-ct2",
    local_dir="ct2/tl",
    repo_type="model"
)

print(" Models downloaded successfully to ct2/en and ct2/tl")


