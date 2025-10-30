# Embedding the Agroforestry Gallery

This guide provides detailed instructions for embedding the EURAF Agroforestry Gallery into your website or project using iframe integration.

## Quick Start

The gallery is hosted at **https://euraf.github.io/agroforestry-gallery/** and can be embedded using a simple iframe:

```html
<iframe 
  src="https://euraf.github.io/agroforestry-gallery/" 
  width="100%" 
  height="800" 
  frameborder="0" 
  title="EURAF Agroforestry Gallery">
</iframe>
```

## Integration Options

### Basic Iframe Embedding

For simple integration with fixed dimensions:

```html
<iframe 
  src="https://euraf.github.io/agroforestry-gallery/" 
  width="100%" 
  height="800" 
  frameborder="0" 
  title="EURAF Agroforestry Gallery">
</iframe>
```

### Responsive Iframe

For responsive design that adapts to different screen sizes:

```html
<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
  <iframe 
    src="https://euraf.github.io/agroforestry-gallery/" 
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
    frameborder="0" 
    title="EURAF Agroforestry Gallery">
  </iframe>
</div>
```

### Enhanced Security Iframe

For enhanced security and performance:

```html
<iframe 
  src="https://euraf.github.io/agroforestry-gallery/" 
  width="100%" 
  height="800" 
  frameborder="0" 
  sandbox="allow-scripts allow-same-origin" 
  loading="lazy"
  title="EURAF Agroforestry Gallery">
</iframe>
```

## Customization Options

### Height Recommendations

- **Minimum height**: 600px for basic functionality
- **Recommended height**: 800px for optimal user experience
- **Full-screen experience**: Use responsive iframe with viewport-based sizing

### Security Attributes

- **`sandbox="allow-scripts allow-same-origin"`**: Enables necessary functionality while maintaining security
- **`loading="lazy"`**: Improves page performance by loading the iframe only when needed
- **`title="EURAF Agroforestry Gallery"`**: Required for accessibility compliance

### Styling Options

You can wrap the iframe in a container for additional styling:

```html
<div class="gallery-container" style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
  <iframe 
    src="https://euraf.github.io/agroforestry-gallery/" 
    width="100%" 
    height="800" 
    frameborder="0" 
    title="EURAF Agroforestry Gallery">
  </iframe>
</div>
```

## Benefits of Iframe Integration

### Automatic Updates
- **No Maintenance Required**: The gallery updates automatically as new photos are added to Zenodo
- **Always Current**: Displays the latest approved photos from the EURAF community
- **Self-Contained**: All functionality works within the iframe

### Full Functionality
- **Interactive Filters**: Users can filter photos by agroforestry typologies
- **Map View**: Geo-tagged photos can be viewed on an interactive map
- **Photo Upload Interface**: Users can access upload instructions directly
- **Responsive Design**: Adapts to different screen sizes and devices

### Cross-Platform Compatibility
- **Universal Support**: Works with any website or content management system
- **No Dependencies**: Requires no additional libraries or frameworks
- **SEO Friendly**: Does not interfere with your site's search engine optimization

## Technical Considerations

### Performance
- Use `loading="lazy"` to defer iframe loading until it's needed
- Consider the iframe height impact on page load times
- The gallery is optimized for performance with progressive image loading

### Accessibility
- Always include a descriptive `title` attribute
- Ensure sufficient color contrast in your surrounding content
- The gallery itself follows accessibility best practices

### Mobile Responsiveness
- The gallery is fully responsive and works well on mobile devices
- Use responsive iframe techniques for optimal mobile experience
- Consider touch-friendly interactions for mobile users

## Content Management Systems

### WordPress
Add the iframe code to any page or post using the HTML/Code block:

1. Add a "Custom HTML" block
2. Paste the iframe code
3. Publish or update the page

### Drupal
Use the "Text (formatted)" field with "Full HTML" format to embed the iframe.

### Other CMS Platforms
Most content management systems allow raw HTML input where you can insert the iframe code.

## Troubleshooting

### Common Issues

**Iframe not displaying**:
- Check that JavaScript is enabled
- Verify the iframe source URL is correct
- Ensure your site allows iframe embedding

**Performance issues**:
- Use `loading="lazy"` attribute
- Consider reducing the iframe height
- Check your server's response times

**Mobile display problems**:
- Use responsive iframe techniques
- Test on various device sizes
- Ensure touch interactions work properly

### Support

For technical support or questions about embedding the gallery, please:
1. Check the [main repository](https://github.com/euraf/agroforestry-gallery) for updates
2. Review the [README](https://github.com/euraf/agroforestry-gallery/blob/main/README.md) for additional information
3. Contact the [DigitAF](https://digitaf.eu/) project team through the official channels