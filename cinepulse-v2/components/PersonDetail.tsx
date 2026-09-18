'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Calendar,Clapperboard,Film,MapPin,Star,Users} from 'lucide-react';
import type {Person} from '@/lib/types';
import {api,dateLabel} from './client';
import {useApp} from './Context';
import {ErrorBox,Loading,Modal} from './UI';

export function PersonDetail({personId,onClose}:{personId:number;onClose:()=>void}) {
  const {openTitle}=useApp();
  const [person,setPerson]=useState<Person|null>(null),[error,setError]=useState('');

  useEffect(()=>{
    const controller=new AbortController();
    setError('');
    api<{person:Person}>(`/person/${personId}`,'GET',undefined,controller.signal)
      .then(d=>setPerson(d.person))
      .catch(e=>{if(e.name!=='AbortError')setError(e.message||'Profile could not be loaded.');});
    return()=>controller.abort();
  },[personId]);

  return (
    <Modal label={person?.name||'Person profile'} wide onClose={onClose}>
      {error ? (
        <div className="modal-pad"><ErrorBox message={error}/></div>
      ) : !person ? (
        <Loading/>
      ) : (
        <>
          {/* Hero header */}
          <div className="person-hero">
            {person.profilePath
              ? <img className="person-photo" src={person.profilePath} alt={person.name} loading="lazy"/>
              : <div className="person-photo-empty"><Users size={48}/></div>
            }
            <div className="person-hero-info">
              <span className="eyebrow mint">{person.knownForDepartment.toUpperCase()}</span>
              <h2>{person.name}</h2>
              <div className="person-meta-row">
                {person.birthday && (
                  <span><Calendar size={13}/> Born {dateLabel(person.birthday)}</span>
                )}
                {person.placeOfBirth && (
                  <span><MapPin size={13}/> {person.placeOfBirth}</span>
                )}
              </div>
            </div>
          </div>

          <div className="person-body">
            {/* Biography */}
            {person.biography ? (
              <section className="person-bio">
                <span className="eyebrow">BIOGRAPHY</span>
                <p>{person.biography.slice(0,900)}{person.biography.length>900?'…':''}</p>
              </section>
            ) : (
              <p className="muted">No biography available from TMDB.</p>
            )}

            {/* Filmography */}
            {person.credits.length > 0 && (
              <section className="person-filmography">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">FILMOGRAPHY</span>
                    <h3>Known for {person.credits.length} titles</h3>
                  </div>
                  <span className="outline-pill">SORTED BY POPULARITY</span>
                </div>
                <div className="person-credits-grid">
                  {person.credits.map(credit=>(
                    <button
                      key={credit.id+credit.job+credit.character}
                      className="person-credit-card glass"
                      onClick={()=>{onClose();setTimeout(()=>openTitle(credit.id),200);}}
                    >
                      <div className="person-credit-poster">
                        {credit.poster
                          ? <img src={credit.poster} alt="" loading="lazy"/>
                          : <Clapperboard size={24}/>
                        }
                      </div>
                      <div className="person-credit-info">
                        <strong>{credit.title}</strong>
                        {credit.character && <small className="mint">as {credit.character}</small>}
                        {credit.job && <small className="muted">{credit.job}</small>}
                        <span className="muted" style={{fontSize:9}}>{credit.releaseDate?.slice(0,4)||'TBA'} · {credit.mediaType==='tv'?'Series':'Film'}</span>
                      </div>
                      <ArrowUpRight size={13} className="muted" style={{flexShrink:0}}/>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
