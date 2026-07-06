import os
import sys
import argparse
import subprocess
from google.cloud import storage

def pull_payload_from_gcs(bucket_name, remote_folder, local_target):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=remote_folder)

    os.makedirs(local_target, exist_ok=True)
    download_count = 0
    for blob in blobs:
        blob_name_lower = blob.name.lower()
        if blob_name_lower.endswith(('.jpg', '.jpeg', '.png', '.webp')):
            dest = os.path.join(local_target, os.path.basename(blob.name))
            blob.download_to_filename(dest)
            download_count += 1

    if download_count == 0:
        raise RuntimeError(f"[Lumenary Pipeline] No image assets found in gs://{bucket_name}/{remote_folder}/ — check the folder path and file extensions.")

def run_production_optimization(source_dir, output_dir):
    """Executes high-fidelity point optimization."""
    cmd = [
        "python3", "train.py",
        "-s", source_dir,
        "-m", output_dir,
        "--iterations", "30000"
    ]
    subprocess.run(cmd, check=True)

def push_model_to_vault(bucket_name, local_file, remote_dest):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(remote_dest)
    blob.upload_from_filename(local_file)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--bucket', type=str, required=True)
    parser.add_argument('--folder', type=str, required=True)
    args = parser.parse_args()

    RAW_PATH = "/tmp/input_frames"
    MODEL_PATH = "/tmp/output_model"

    pull_payload_from_gcs(args.bucket, args.folder, RAW_PATH)
    run_production_optimization(RAW_PATH, MODEL_PATH)
    
    target_ply = os.path.join(MODEL_PATH, "point_cloud/iteration_30000/point_cloud.ply")
    push_model_to_vault(args.bucket, target_ply, f"production_tours/{args.folder}/density_map.ply")
