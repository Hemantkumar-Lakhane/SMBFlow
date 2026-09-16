"""
core/image_router.py
====================
Image generation router abstraction for SMBFlow.
Uses the official google-genai Python SDK directly (GEMINI_API_KEY).
No Vertex AI, ADC, or LiteLLM. Real image asset generation only.
"""

import base64
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
import structlog

log = structlog.get_logger()


class ImageRouter:
    """
    ImageRouter abstraction for Product Launch visual generation.
    Directly invokes Google Gemini Developer API via google-genai Python SDK.
    Never returns fake success.
    """

    def __init__(self, default_model: str = "gemini-3.1-flash-image"):
        self.default_model = default_model

    async def generate(
        self,
        prompt: str,
        visual_role: str,
        aspect_ratio: str = "16:9",
        product_brief: Optional[Dict[str, Any]] = None,
        brand_context: Optional[Dict[str, Any]] = None,
        reference_images: Optional[List[str]] = None,
        resolution: str = "1K",
        model_override: Optional[str] = None,
        preview_only: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate image asset from prompt, visual role, brief, and brand context.
        Uses google-genai SDK directly. If preview_only is True (e.g. unit tests without API key),
        returns preview_only status instead of generated.
        """
        model = model_override or self.default_model
        brief = product_brief or {}
        product_name = brief.get("productName") or "SMBFlow Launch"

        log.info(
            "ImageRouter.generate starting via google-genai",
            role=visual_role,
            model=model,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

        if preview_only or not api_key:
            if not api_key and not preview_only:
                log.error("Image generation failed: GEMINI_API_KEY not found in environment")
                return {
                    "status": "failed",
                    "generated_asset_url": None,
                    "error": "GEMINI_API_KEY not configured in environment",
                    "generation_model": model,
                    "provider": "google_genai",
                    "created_at": datetime.utcnow().isoformat(),
                }
            
            # Preview only fixture (unit tests / mock preview mode)
            preview_url = self._generate_preview_svg_url(product_name, visual_role, prompt, aspect_ratio, resolution)
            return {
                "status": "preview_only",
                "generated_asset_url": preview_url,
                "generation_model": model,
                "provider": "google_genai_preview",
                "resolution": resolution,
                "aspect_ratio": aspect_ratio,
                "visual_role": visual_role,
                "visual_prompt": prompt,
                "created_at": datetime.utcnow().isoformat(),
            }

        # Real Gemini image generation using official google-genai SDK
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            enhanced_prompt = (
                f"Marketing visual for product '{product_name}'. Role: {visual_role}. Aspect ratio: {aspect_ratio}. "
                f"Prompt: {prompt}. High resolution commercial product marketing visual, clean composition."
            )

            img_bytes = None

            # Try client.models.generate_images first
            try:
                img_res = client.models.generate_images(
                    model=model,
                    prompt=enhanced_prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio=aspect_ratio,
                        output_mime_type="image/png",
                    ),
                )
                if img_res and hasattr(img_res, "generated_images") and len(img_res.generated_images) > 0:
                    img_bytes = img_res.generated_images[0].image.image_bytes
            except Exception as gen_img_err:
                log.info("generate_images call fallback to generate_content or alternate model", error=str(gen_img_err))

            # Fallback attempt with generate_images on imagen-3.0-generate-002 if gemini-3.1-flash-image is unavailable for generate_images
            if not img_bytes:
                try:
                    img_res = client.models.generate_images(
                        model="imagen-3.0-generate-002",
                        prompt=enhanced_prompt,
                        config=types.GenerateImagesConfig(
                            number_of_images=1,
                            aspect_ratio=aspect_ratio,
                            output_mime_type="image/png",
                        ),
                    )
                    if img_res and hasattr(img_res, "generated_images") and len(img_res.generated_images) > 0:
                        img_bytes = img_res.generated_images[0].image.image_bytes
                        model = "imagen-3.0-generate-002"
                except Exception as fallback_err:
                    log.info("imagen-3.0-generate-002 fallback attempt error", error=str(fallback_err))

            # Fallback attempt with generate_content for multimodal image models
            if not img_bytes:
                try:
                    content_res = client.models.generate_content(
                        model=model,
                        contents=f"Generate a high-quality product image: {enhanced_prompt}",
                    )
                    if content_res and content_res.candidates and len(content_res.candidates) > 0:
                        for part in content_res.candidates[0].content.parts:
                            if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                                img_bytes = part.inline_data.data
                                break
                except Exception as content_err:
                    log.info("generate_content fallback attempt error", error=str(content_err))

            if not img_bytes:
                log.error("Gemini image generation produced no image bytes", role=visual_role)
                return {
                    "status": "failed",
                    "generated_asset_url": None,
                    "error": "Gemini API returned no image data",
                    "generation_model": model,
                    "provider": "google_genai",
                    "created_at": datetime.utcnow().isoformat(),
                }

            # Save generated PNG asset to local storage directory
            storage_dir = os.path.join(os.getcwd(), "evidence", "generated_assets")
            os.makedirs(storage_dir, exist_ok=True)
            filename = f"vis_{uuid.uuid4().hex[:8]}.png"
            file_path = os.path.join(storage_dir, filename)

            with open(file_path, "wb") as f:
                f.write(img_bytes)

            b64_img = base64.b64encode(img_bytes).decode("utf-8")
            asset_url = f"data:image/png;base64,{b64_img}"

            log.info("Gemini image generation succeeded", role=visual_role, model=model, bytes_saved=len(img_bytes))

            return {
                "status": "generated",
                "generated_asset_url": asset_url,
                "storage_path": file_path,
                "generation_model": model,
                "provider": "google_genai",
                "resolution": resolution,
                "aspect_ratio": aspect_ratio,
                "visual_role": visual_role,
                "visual_prompt": prompt,
                "created_at": datetime.utcnow().isoformat(),
            }

        except Exception as api_err:
            log.error("Gemini image generation API error", error=str(api_err))
            return {
                "status": "failed",
                "generated_asset_url": None,
                "error": f"Gemini API error: {str(api_err)}",
                "generation_model": model,
                "provider": "google_genai",
                "created_at": datetime.utcnow().isoformat(),
            }

    async def regenerate(
        self,
        visual_id: str,
        prompt: str,
        visual_role: str,
        aspect_ratio: str = "16:9",
        product_brief: Optional[Dict[str, Any]] = None,
        resolution: str = "1K",
        preview_only: bool = False,
    ) -> Dict[str, Any]:
        """Regenerate visual with updated prompt or settings."""
        result = await self.generate(
            prompt=prompt,
            visual_role=visual_role,
            aspect_ratio=aspect_ratio,
            product_brief=product_brief,
            resolution=resolution,
            preview_only=preview_only,
        )
        result["visual_id"] = visual_id
        result["regenerated_at"] = datetime.utcnow().isoformat()
        return result

    async def edit(
        self,
        visual_id: str,
        new_prompt: str,
        visual_role: str,
        aspect_ratio: str = "16:9",
        preview_only: bool = False,
    ) -> Dict[str, Any]:
        """Update prompt and re-run generation."""
        result = await self.generate(
            prompt=new_prompt,
            visual_role=visual_role,
            aspect_ratio=aspect_ratio,
            preview_only=preview_only,
        )
        result["visual_id"] = visual_id
        result["edited_at"] = datetime.utcnow().isoformat()
        return result

    def _generate_preview_svg_url(
        self,
        product_name: str,
        role: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
    ) -> str:
        """Offline SVG preview url for test mode only."""
        width = 1200
        height = 1200 if aspect_ratio == "1:1" else 675
        svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="60" y="100" fill="#ffffff" font-size="24">{role}</text><text x="60" y="200" fill="#818cf8" font-size="40">{product_name}</text></svg>"""
        b64_svg = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
        return f"data:image/svg+xml;base64,{b64_svg}"
