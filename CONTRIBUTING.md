# Contributing to Komando

First off, thank you for considering contributing to Komando! It's people like you that make Komando such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if possible**
- **Include your browser and OS version**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List any alternative solutions you've considered**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure your code follows the existing style
4. Make sure your code lints
5. Issue the pull request

## Development Setup

1. Fork and clone the repo
   ```bash
   git clone https://github.com/YOUR_USERNAME/komando.git
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Start the development server
   ```bash
   npm start
   ```

4. Make your changes and test them

## Style Guide

### JavaScript/React

- Use functional components with hooks
- Use meaningful variable and function names
- Keep components focused and modular
- Use ES6+ features

### CSS

- Use CSS custom properties (variables) for colors
- Follow the existing naming convention (`.kf-*` prefix)
- Keep styles organized by component

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters
- Reference issues and pull requests when relevant

## Project Structure

```
src/
├── App.jsx      # Main app component with all features
├── main.jsx     # React entry point
└── styles.css   # All styles
```

Currently, the app is a single-file application for simplicity. As it grows, we may refactor into separate component files.

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing! 🎉
