FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    git curl python3-pip python3-dev libgl1-mesa-glx libglib2.0-0 ninja-build \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu124
RUN pip3 install --no-cache-dir google-cloud-storage argparse plyfile tqdm opencv-python-headless joblib

WORKDIR /workspace

# Pull the primary production 3DGS code tracking repository
RUN git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting /workspace/3dgs
WORKDIR /workspace/3dgs

# Run native C++/CUDA sub-mesh bindings compilation loop
RUN pip3 install --no-cache-dir submodules/diff-gaussian-rasterization \
    && pip3 install --no-cache-dir submodules/simple-knn \
    && pip3 install --no-cache-dir submodules/fused-ssim

COPY src/pipeline/train_splat.py /workspace/3dgs/train_splat.py

ENTRYPOINT ["python3", "/workspace/3dgs/train_splat.py"]
