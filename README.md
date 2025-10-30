# Agroforestry Gallery
The **Agroforestry Gallery** is a key feature of **DigitAF's Agroforestry Virtual Space**, providing a dynamic platform for sharing and exploring agroforestry-related images.

Through the gallery, users can upload their own photos directly to the [EURAF Agroforestry Media Zenodo community](https://zenodo.org/communities/euraf-media). Each uploaded image receives a DOI, is stored under an open license (default: CC BY 4.0), and is automatically integrated into the gallery via the [International Image Interoperability Framework (IIIF)](https://iiif.io/) and the [Zenodo](https://zenodo.org) API.

Because it is served directly from this EURAF GitHub repository, **the gallery can easily be embedded or adapted by other projects**, making it a ready-to-use solution for anyone who wants to showcase agroforestry imagery on their own website.

Its decentralized workflow is simple yet sustainable: contributors submit photos to Zenodo, EURAF curators review them for quality, and approved images appear in the public gallery. This approach ensures long-term scalability, even after the DigitAF project concludes, and may inspire other initiatives to reuse both the concept and the code. It offers an elegant and FAIR-compliant solution to image storing and sharing, avoiding "Can I use this picture?", "Where is the full resolution to use in printing material", "Who is the author of this picture?" or "How do I cite this picture". The gallery features permanent, curated photo collections from EURAF and its partners. All images are freely available for learning and exploration, with geo-tagged photos marked by a globe icon, when the coordinate is supplied by the author in the Zenodo record.

**By participating, you not only share your own perspective on agroforestry but also support an open, collaborative approach to knowledge sharing that reflects EURAF's values**.

## How to Upload Photos

Detailed step-by-step instructions for uploading photos to the gallery are available in the [`zenodo-upload-instructions.md`](./zenodo-upload-instructions.md) file. These instructions are also dynamically loaded and displayed in the gallery's "Add Photo" interface.

The upload process involves:
1. Creating a Zenodo account if you don't have one
2. Uploading your photo to the EURAF agroforestry-media community
3. Adding proper metadata including EURAF typology keywords
4. Optionally adding coordinates for geo-tagged photos

### Technical Implementation

The gallery dynamically loads upload instructions from the Markdown file using JavaScript, providing a clean separation between content and code. This approach allows for:

- Easy content updates without modifying HTML
- Version control of instructions
- Reusable content across different interfaces
- Improved maintainability

To learn more, contribute, or explore how this gallery can enrich your own platform, visit [DigitAF](https://digitaf.eu).
