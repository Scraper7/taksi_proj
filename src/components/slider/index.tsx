import React, { useState, useEffect, useRef } from 'react'
import Glide from '@glidejs/glide'
import '@glidejs/glide/dist/css/glide.core.min.css'
import '@glidejs/glide/dist/css/glide.theme.min.css'
import { EFileType, IFile } from '../../types/types'
import './styles.scss'
import images from '../../constants/images'
import cn from 'classnames'
import SITE_CONSTANTS from '../../siteConstants'
import { modalsActionCreators } from '../../state/modals'
import { connect, ConnectedProps } from 'react-redux'
import DeleteFileModal from '../modals/DeleteFileModal'

const mapDispatchToProps = {
  setDeleteFilesModal: modalsActionCreators.setDeleteFilesModal,
}

const connector = connect(null, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  files?: IFile[]
  slides?: React.ReactNode[]
  options?: Glide.Options
  controls?: boolean
  bullets?: boolean
  className?: string,
  mobileFriendly?: boolean
  headerLabel?: string
  handleDelete?: (src: IFile['src']) => any
  handleDeleteAll?: () => any
}

const thumbnailMax = 300
const thumbnailFileStyle: React.CSSProperties = {
  maxWidth: thumbnailMax,
  maxHeight: thumbnailMax,
}
const fullscreenFileStyle: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  zIndex: 9999,
  objectFit: 'contain',
}

const Slider: React.FC<IProps> = ({
  files,
  slides,
  options = {},
  controls,
  bullets,
  className,
  mobileFriendly,
  headerLabel,
  handleDelete,
  handleDeleteAll,
  setDeleteFilesModal,
}) => {
  const [id] = useState(`g${+new Date()}`)
  const [glide, setGlide] = useState<Glide.Properties | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showThumbnails, setShowThumbnails] = useState<number | null>(null)

  const ref = useRef<HTMLDivElement>(null)

  const total = (files?.length || 0) + (slides?.length || 0)

  useEffect(() => {
    // glide?.destroy()

    const maxPerView = Math.floor((ref.current?.clientWidth || 1) / (thumbnailMax * 1.25))
    const perView = Math.max(
      mobileFriendly ?
        Math.min(files?.length || 1, maxPerView) :
        options.perView || 1,
      1,
    )

    const startAt = perView < total ?
      (
        (showThumbnails || glide?.index || 0) > (total - perView) ?
          total - maxPerView :
          showThumbnails || glide?.index || 0
      ) :
      0

    const instanceSettings = new Glide(`#${id}`, {
      bound: true,
      perView,
      ...options,
      startAt,
    })

    const instance = instanceSettings.mount()
    instanceSettings.on('run', () => {
      setCurrentSlide(instance.index)
      mobileFriendly && setShowThumbnails(null)
    })

    setGlide(instance)
    setCurrentSlide(startAt)

    return () => {
      instance.destroy()
    }
  }, [files, showThumbnails, ref.current, id])

  const getSlide = (file: IFile, index: number, out?: boolean) => {
    switch (file.type) {
      case EFileType.Image: return (
        <img
          src={file.src}
          alt={file.src}
          style={mobileFriendly && showThumbnails === index && out ? fullscreenFileStyle : thumbnailFileStyle}
          onClick={() => setShowThumbnails(prev => prev !== null ? null : index)}
        />
      )
      case EFileType.Video: return (
        <video
          src={file.src}
          controls={!(mobileFriendly && showThumbnails !== index)}
          style={mobileFriendly && showThumbnails === index && out ? fullscreenFileStyle : thumbnailFileStyle}
          onClick={() => setShowThumbnails(prev => prev !== null ? null : index)}
          onPause={() => setShowThumbnails(null)}
        />
      )
    }
  }

  return (
    <>
      {
        handleDelete && handleDeleteAll && glide && files && (
          <DeleteFileModal
            handleDeleteFile={() => handleDelete(files[glide.index].src)}
            handleDeleteFiles={handleDeleteAll}
          />
        )
      }
      {files && showThumbnails !== null && getSlide(files[showThumbnails], showThumbnails, true)}
      <div id={id} className={cn('slider', className)} ref={ref}>
        {headerLabel && (
          <div className="slider__header">
            <span className="slider__label">{headerLabel}</span>
            <span className="slider__count">
              <span style={{ color: SITE_CONSTANTS.PALETTE.secondary.main }}>
                {currentSlide + 1}</span>/{(files?.length || 0) + (slides?.length || 0)}
            </span>
            <span></span>
          </div>
        )}
        <div className="glide__arrows" data-glide-el="controls">
          <button className="glide__arrow glide__arrow--left" data-glide-dir="<">
            {controls && currentSlide !== 0 && (
              <img src={images.sliderArrow} alt="previous"/>
            )}
          </button>
        </div>
        <div className="glide__track" data-glide-el="track">
          <ul className="glide__slides">
            {files?.map((item, index) => (
              <li className="glide__slide glide__slide--file" key={index}>{getSlide(item, index)}</li>
            ))}
            {slides}
          </ul>
        </div>
        <div className="glide__arrows" data-glide-el="controls">
          <button className="glide__arrow glide__arrow--right" data-glide-dir=">">
            {controls && (currentSlide !== total - (glide?.settings.perView || 1)) && (
              <img src={images.sliderArrow} alt="next"/>
            )}
          </button>
        </div>
        {bullets && (
          <div className="glide__bullets" data-glide-el="controls[nav]">
            {Array(total).fill(null).map((item, index, array) => {
              const isCurrent = (currentSlide <= index) && (index < currentSlide + (options.perView || 1))
              return (
                <button
                  className={
                    cn(
                      'glide__bullet',
                      {
                        'glide__bullet--current': isCurrent,
                        'glide__bullet--first': currentSlide === index,
                        'glide__bullet--last': index === currentSlide + (options.perView || 1) - 1,
                      },
                    )
                  }
                  data-glide-dir={
                    `=${index < array.length - (options.perView || 1) ? index : array.length - (options.perView || 1)}`
                  }
                  key={index}
                >
                  <hr
                    className="glide__bullet-hr"
                    style={{
                      backgroundColor:
                        isCurrent ? SITE_CONSTANTS.PALETTE.primary.main : SITE_CONSTANTS.PALETTE.primary.light,
                    }}
                  />
                </button>
              )
            })}
          </div>
        )}
        {
          handleDelete && handleDeleteAll && !!files && !!glide && (
            <button
              type='button'
              onClick={() => setDeleteFilesModal({
                isOpen: true,
              })}
              className="slider__delete"
            >
              <img src={images.trash} alt="delete"/>
            </button>
          )
        }
      </div>
    </>
  )
}

export default connector(Slider)